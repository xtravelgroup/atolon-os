-- Partición de audit_log por mes (RANGE en created_at)
-- =====================================================================
-- Antes: tabla monolítica que crece infinito. Cada SELECT por fecha
-- escanea toda la tabla.
--
-- Después: tabla particionada por mes. Cada partición tiene sus
-- propios índices. Queries por rango de fecha solo tocan las
-- particiones relevantes. Eliminar datos viejos = DETACH PARTITION
-- (operación instantánea), no DELETE masivo.
--
-- Estrategia:
--   1. Renombrar audit_log → audit_log_legacy (preserva datos).
--   2. Crear audit_log nueva particionada.
--   3. Pre-crear particiones 2026-01 .. 2027-12.
--   4. Copiar datos del legacy a la nueva (las particiones existentes
--      reciben los rows automáticamente).
--   5. Recrear índices y grants.
--   6. Drop legacy.
--   7. Función helper para crear particiones futuras automáticamente.
--   8. pg_cron job mensual: crear próxima partición, dropear las > 5 años.
-- =====================================================================

BEGIN;

-- 1) Conservar la actual
ALTER TABLE public.audit_log RENAME TO audit_log_legacy;

-- 2) Crear la nueva particionada (PK debe incluir created_at)
CREATE TABLE public.audit_log (
  id            uuid        NOT NULL DEFAULT gen_random_uuid(),
  tabla         text        NOT NULL,
  row_id        text,
  accion        text        NOT NULL,
  cambios       jsonb,
  fila_before   jsonb,
  fila_after    jsonb,
  usuario_email text,
  usuario_id    text,
  contexto      text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- 3) Función helper para crear partición mensual idempotente
CREATE OR REPLACE FUNCTION public.audit_log_ensure_partition(target_month date)
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  start_dt date := date_trunc('month', target_month)::date;
  end_dt   date := (date_trunc('month', target_month) + interval '1 month')::date;
  pname    text := 'audit_log_y' || to_char(start_dt, 'YYYY') || 'm' || to_char(start_dt, 'MM');
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = pname) THEN
    RETURN pname || ' (ya existe)';
  END IF;

  EXECUTE format(
    'CREATE TABLE public.%I PARTITION OF public.audit_log FOR VALUES FROM (%L) TO (%L)',
    pname, start_dt, end_dt
  );

  -- Índices por partición (replicar los del esquema legacy)
  EXECUTE format('CREATE INDEX %I ON public.%I (tabla, created_at DESC)',     pname || '_tabla_idx',   pname);
  EXECUTE format('CREATE INDEX %I ON public.%I (tabla, row_id)',              pname || '_row_idx',     pname);
  EXECUTE format('CREATE INDEX %I ON public.%I (usuario_email, created_at DESC)', pname || '_usuario_idx', pname);
  EXECUTE format('CREATE INDEX %I ON public.%I (created_at DESC)',            pname || '_created_idx', pname);

  RETURN pname || ' (creada)';
END $$;

-- Pre-crear particiones desde 2026-01 a 2027-12 (24 meses, cubre la
-- ventana de datos legacy + 18 meses hacia adelante)
DO $$
DECLARE
  m date;
BEGIN
  FOR m IN
    SELECT generate_series(
      date '2026-01-01',
      date '2027-12-01',
      interval '1 month'
    )::date
  LOOP
    PERFORM public.audit_log_ensure_partition(m);
  END LOOP;
END $$;

-- 4) Copiar datos del legacy
INSERT INTO public.audit_log (id, tabla, row_id, accion, cambios, fila_before, fila_after, usuario_email, usuario_id, contexto, created_at)
SELECT id, tabla, row_id, accion, cambios, fila_before, fila_after, usuario_email, usuario_id, contexto, created_at
FROM public.audit_log_legacy;

-- 5) Grants (igual que estaba antes)
-- service_role escribe; el rol authenticated debería leer su info; la
-- política append-only se enforce vía RLS o revocando UPDATE/DELETE.
GRANT INSERT, SELECT ON public.audit_log TO authenticated;
GRANT INSERT, SELECT ON public.audit_log TO service_role;
-- Append-only en producción — los triggers en otras tablas usan
-- service_role para escribir, y nadie debería poder UPDATE o DELETE.
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_log FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_log FROM service_role;

-- 6) Drop legacy (los datos ya fueron migrados)
DROP TABLE public.audit_log_legacy;

COMMIT;

COMMENT ON TABLE public.audit_log IS
  'Audit log particionado por mes (RANGE en created_at). Append-only: UPDATE/DELETE revocados a nivel de privilegios. Auto-mantenimiento vía pg_cron.';

COMMENT ON FUNCTION public.audit_log_ensure_partition IS
  'Crea (idempotente) la partición mensual de audit_log para el mes que contiene la fecha dada. Incluye sus 4 índices.';

-- 7) Función de mantenimiento: drop particiones más antiguas que N años
CREATE OR REPLACE FUNCTION public.audit_log_drop_old_partitions(retencion_anos int DEFAULT 5)
RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
  cutoff date := (now() - (retencion_anos || ' years')::interval)::date;
  pname text;
  dropped int := 0;
  start_dt date;
BEGIN
  FOR pname IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_inherits i ON i.inhrelid = c.oid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = 'audit_log'
  LOOP
    -- Extraer fecha del nombre (audit_log_yYYYYmMM)
    BEGIN
      start_dt := to_date(substring(pname FROM 'y(\d{4})m(\d{2})$'), 'YYYYMM');
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
    IF start_dt + interval '1 month' <= cutoff THEN
      EXECUTE format('DROP TABLE public.%I', pname);
      dropped := dropped + 1;
    END IF;
  END LOOP;
  RETURN dropped;
END $$;

COMMENT ON FUNCTION public.audit_log_drop_old_partitions IS
  'Drop particiones de audit_log más antiguas que el período de retención (default 5 años). Devuelve cuántas particiones eliminó.';

-- 8) Programar mantenimiento mensual con pg_cron
--    El día 1 de cada mes a las 03:00 UTC:
--      - Crear partición del mes siguiente (idempotente)
--      - Drop particiones que pasen el período de retención
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'audit_log_partition_maint';
SELECT cron.schedule(
  'audit_log_partition_maint',
  '0 3 1 * *',  -- minuto 0, hora 3, día 1, cualquier mes, cualquier dia-semana
  $JOB$
    SELECT public.audit_log_ensure_partition((date_trunc('month', now()) + interval '2 months')::date);
    SELECT public.audit_log_drop_old_partitions(5);
  $JOB$
);
