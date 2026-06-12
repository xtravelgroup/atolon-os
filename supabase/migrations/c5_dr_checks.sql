-- KPMG C-5 · Backup verification & Disaster Recovery
-- =====================================================================
-- Supabase Pro garantiza backups automáticos diarios + Point-in-Time
-- Recovery (PITR) configurable. Esto NO es suficiente para un audit:
-- KPMG / NIA 315 exige evidencia de que el backup FUNCIONA
-- (integridad, restore tests, RPO/RTO documentados).
--
-- Este módulo agrega:
--   1) Tabla dr_checks  → registro de cada verificación de integridad
--   2) Función dr_run_integrity_check() → ejecuta assertions y devuelve
--      un JSON con resultados; quien la invoca guarda en dr_checks.
--   3) Tabla dr_policy → RPO/RTO + runbook (single-row config)
-- =====================================================================

-- ── 1) Tabla de verificaciones ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dr_checks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ejecutado_at    timestamptz NOT NULL DEFAULT now(),
  ejecutado_por   text,                              -- email del operador
  tipo            text NOT NULL DEFAULT 'manual',    -- manual | scheduled | restore_test
  resultado       text NOT NULL,                     -- ok | warning | fail
  assertions      jsonb NOT NULL,                    -- detalle por assertion
  duracion_ms     int,
  notas           text
);

CREATE INDEX IF NOT EXISTS idx_dr_checks_ejecutado_at
  ON public.dr_checks (ejecutado_at DESC);

COMMENT ON TABLE public.dr_checks IS
  'KPMG C-5: registro de cada verificación de integridad post-backup. Soporta evidencia de auditoría.';

GRANT SELECT, INSERT ON public.dr_checks TO authenticated;

-- ── 2) Política DR (single-row) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dr_policy (
  id              int PRIMARY KEY DEFAULT 1,
  rpo_horas       int NOT NULL DEFAULT 24,    -- pérdida tolerable
  rto_horas       int NOT NULL DEFAULT 4,     -- tiempo máx para restaurar
  retencion_dias  int NOT NULL DEFAULT 7,     -- Supabase Pro default
  pitr_dias       int NOT NULL DEFAULT 7,     -- Point-in-time recovery
  runbook         text,
  ultima_revision timestamptz,
  revisado_por    text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (id = 1)  -- single-row enforcement
);

INSERT INTO public.dr_policy (id, runbook) VALUES (1,
$RUNBOOK$# Runbook de Recuperación — Atolón OS

## Targets
- **RPO** (Recovery Point Objective): pérdida máxima de datos tolerable = **24 horas**
- **RTO** (Recovery Time Objective): tiempo máximo para volver a operar = **4 horas**

## Backups disponibles
| Tipo | Frecuencia | Retención | Quién lo gestiona |
|---|---|---|---|
| Snapshot diario | Cada noche | 7 días | Supabase (automático) |
| Point-in-Time Recovery (PITR) | Continuo (WAL) | 7 días | Supabase (automático) |
| Verificación de integridad | Diaria recomendada | ∞ en dr_checks | App (manual o cron) |

## Procedimiento de Restore (PRD → SAME PROJECT)

1. **Detectar incidente** — alerta de integridad falla, datos corruptos, eliminación masiva accidental.
2. **Aislar el daño** — desactivar el módulo afectado (`/configuracion → modo mantenimiento`).
3. **Identificar punto de restauración** — timestamp ANTES del incidente.
4. **Supabase Dashboard → Database → Backups**:
   - Para restore total: clic en snapshot más reciente válido → "Restore"
   - Para PITR (mayor precisión): "Restore to point in time" → ingresar timestamp UTC
5. **Tiempo esperado**: 15-45 min para BD < 1 GB, 1-3 horas para > 10 GB.
6. **Validar restore** — correr `dr_run_integrity_check()` desde la app antes de reabrir.
7. **Comunicar** — Gerencia + clientes afectados si la ventana fue > 30 min.
8. **Post-mortem** — registrar incidente en `audit_log` con contexto.

## Procedimiento de Restore a Staging (para tests)
1. Crear proyecto Supabase nuevo "atolon-staging"
2. Database → Backups → Download snapshot del proyecto prod
3. psql -h staging -U postgres < snapshot.sql
4. Correr `dr_run_integrity_check()`

## Owners
- **Eric Kern** (super_admin) — único con acceso a Dashboard Supabase para Restore
- **Contabilidad** — verificación de integridad financiera post-restore
- **Penagos (auditor)** — review de evidencia post-incidente

## Pruebas obligatorias (compliance)
- 1× al mes: ejecutar `dr_run_integrity_check()` y guardar resultado
- 1× al trimestre: restore test a staging documentado en dr_checks tipo "restore_test"
- 1× al año: simulacro de incidente real (con un down window planeado)
$RUNBOOK$
)
ON CONFLICT (id) DO NOTHING;

GRANT SELECT, UPDATE ON public.dr_policy TO authenticated;

COMMENT ON TABLE public.dr_policy IS
  'KPMG C-5: política y runbook de DR. Single-row (id=1).';

-- ── 3) Función de verificación de integridad ─────────────────────────
-- Corre una serie de assertions y devuelve JSON. NO escribe en dr_checks
-- (eso lo hace el cliente para llevar el ejecutado_por con el JWT email).
CREATE OR REPLACE FUNCTION public.dr_run_integrity_check()
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  result  jsonb := '[]'::jsonb;
  total_status text := 'ok';

  -- Counters
  cnt_reservas       int;
  cnt_clientes       int;
  cnt_eventos        int;
  cnt_requisiciones  int;
  cnt_oc             int;
  cnt_cierres        int;
  cnt_usuarios       int;
  cnt_audit          bigint;

  -- Orphan checks
  orphan_reservas_evento  int;
  orphan_oc_req           int;
  pwd_history_empty       int;

  -- Audit log freshness
  last_audit_age_hours numeric;
BEGIN
  SELECT COUNT(*) INTO cnt_reservas FROM public.reservas;
  SELECT COUNT(*) INTO cnt_clientes FROM public.clientes;
  SELECT COUNT(*) INTO cnt_eventos  FROM public.eventos;
  SELECT COUNT(*) INTO cnt_requisiciones FROM public.requisiciones;
  SELECT COUNT(*) INTO cnt_oc       FROM public.ordenes_compra;
  SELECT COUNT(*) INTO cnt_usuarios FROM public.usuarios;
  SELECT COUNT(*) INTO cnt_audit    FROM public.audit_log;
  BEGIN
    SELECT COUNT(*) INTO cnt_cierres FROM public.cierres_caja;
  EXCEPTION WHEN OTHERS THEN cnt_cierres := -1; END;

  -- A1) Conteos mínimos esperados
  result := result || jsonb_build_object(
    'name','table_counts',
    'status', CASE WHEN cnt_reservas < 1 OR cnt_clientes < 1 OR cnt_usuarios < 1
                   THEN 'fail' ELSE 'ok' END,
    'detail', jsonb_build_object(
      'reservas', cnt_reservas, 'clientes', cnt_clientes,
      'eventos', cnt_eventos, 'requisiciones', cnt_requisiciones,
      'ordenes_compra', cnt_oc, 'cierres_caja', cnt_cierres,
      'usuarios', cnt_usuarios, 'audit_log', cnt_audit
    )
  );

  -- A2) Audit log freshness (último evento < 30 días)
  BEGIN
    SELECT EXTRACT(EPOCH FROM (now() - MAX(created_at)))/3600
      INTO last_audit_age_hours
      FROM public.audit_log;
  EXCEPTION WHEN OTHERS THEN last_audit_age_hours := NULL; END;
  result := result || jsonb_build_object(
    'name','audit_log_freshness',
    'status',
      CASE
        WHEN last_audit_age_hours IS NULL THEN 'warning'
        WHEN last_audit_age_hours > 720   THEN 'warning'  -- > 30 días
        ELSE 'ok'
      END,
    'detail', jsonb_build_object('horas_desde_ultimo_evento', last_audit_age_hours)
  );

  -- A3) Huérfanos: OCs apuntando a requisiciones inexistentes
  SELECT COUNT(*) INTO orphan_oc_req
  FROM public.ordenes_compra oc
  WHERE oc.requisicion_ids IS NOT NULL
    AND jsonb_array_length(oc.requisicion_ids) > 0
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(oc.requisicion_ids) e(req_id)
      JOIN public.requisiciones r ON r.id = e.req_id
    );
  result := result || jsonb_build_object(
    'name','oc_requisicion_orphans',
    'status', CASE WHEN orphan_oc_req > 0 THEN 'warning' ELSE 'ok' END,
    'detail', jsonb_build_object('huerfanos', orphan_oc_req)
  );

  -- A4) Usuarios admin sin password_changed_at (cumplimiento C-2)
  SELECT COUNT(*) INTO pwd_history_empty
  FROM public.usuarios
  WHERE rol_id IN ('super_admin','admin','contabilidad','stripe_admin')
    AND password_changed_at IS NULL
    AND must_change_password = false;
  result := result || jsonb_build_object(
    'name','pwd_changed_at_present',
    'status', CASE WHEN pwd_history_empty > 0 THEN 'warning' ELSE 'ok' END,
    'detail', jsonb_build_object('admins_sin_password_changed_at', pwd_history_empty)
  );

  -- Determinar status global
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(result) e WHERE e->>'status' = 'fail') THEN
    total_status := 'fail';
  ELSIF EXISTS (SELECT 1 FROM jsonb_array_elements(result) e WHERE e->>'status' = 'warning') THEN
    total_status := 'warning';
  END IF;

  RETURN jsonb_build_object(
    'overall', total_status,
    'assertions', result,
    'ran_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.dr_run_integrity_check() TO authenticated;

COMMENT ON FUNCTION public.dr_run_integrity_check IS
  'KPMG C-5: corre verificación de integridad sobre tablas críticas. Devuelve JSON con assertions + overall status.';
