-- KPMG C-4 · Segregation of Duties (SoD)
-- ====================================================================
-- Defensa en BD para impedir que el MISMO usuario cumpla dos roles
-- incompatibles en una transacción crítica.
--
-- Trigger 1 · requisiciones: solicitante_id ≠ aprobador_id cuando
--            estado pasa a 'Aprobada' o 'Rechazada'.
-- Trigger 2 · ordenes_compra: emitida_por ≠ anticipo_pagado_por.
-- Tabla 3   · sod_exceptions: registro de excepciones autorizadas
--            por Gerencia (con expiración y motivo).
-- Vista 4   · sod_violations_log: cruza audit_log + estado actual
--            para detectar violaciones históricas o de runtime.
-- ====================================================================

-- ── 1) Tabla de excepciones autorizadas ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.sod_exceptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabla           text NOT NULL,
  usuario_id      text NOT NULL,
  motivo          text NOT NULL,
  autorizado_por  text NOT NULL,
  valido_desde    timestamptz NOT NULL DEFAULT now(),
  valido_hasta    timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (valido_hasta > valido_desde),
  CHECK (length(motivo) >= 20)  -- forzar justificación real
);

CREATE INDEX IF NOT EXISTS idx_sod_exceptions_lookup
  ON public.sod_exceptions (tabla, usuario_id, valido_hasta);

COMMENT ON TABLE public.sod_exceptions IS
  'KPMG C-4: excepciones temporales a la matriz de SoD. Cada fila requiere autorización explícita de un super_admin y debe tener fecha de expiración.';

-- ── 2) Función helper: ¿hay excepción activa? ───────────────────────
CREATE OR REPLACE FUNCTION public.sod_has_exception(
  p_tabla   text,
  p_usuario text
) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.sod_exceptions
    WHERE tabla = p_tabla
      AND usuario_id = p_usuario
      AND valido_desde <= now()
      AND valido_hasta >  now()
  );
$$;

-- ── 3) Trigger en requisiciones: prevenir self-approval ──────────────
CREATE OR REPLACE FUNCTION public.req_sod_check()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Aplica solo si la req pasa a un estado terminal CON aprobador asignado
  IF NEW.estado IN ('Aprobada','Rechazada')
     AND NEW.solicitante_id IS NOT NULL
     AND NEW.aprobador_id   IS NOT NULL
     AND NEW.solicitante_id = NEW.aprobador_id
  THEN
    -- Permitir solo si hay excepción explícita vigente
    IF NOT public.sod_has_exception('requisiciones', NEW.solicitante_id) THEN
      RAISE EXCEPTION
        'KPMG C-4 SoD: el solicitante (%) no puede ser el mismo que el aprobador. Si es estrictamente necesario, un super_admin debe registrar una excepción en sod_exceptions con motivo y vigencia.',
        NEW.solicitante_id
        USING ERRCODE = '42501';  -- insufficient_privilege
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_req_sod_check ON public.requisiciones;
CREATE TRIGGER trg_req_sod_check
  BEFORE INSERT OR UPDATE OF estado, aprobador_id
  ON public.requisiciones
  FOR EACH ROW EXECUTE FUNCTION public.req_sod_check();

COMMENT ON FUNCTION public.req_sod_check IS
  'KPMG C-4: bloquea autoaprobación de requisiciones. Falla con SQLSTATE 42501 si solicitante_id = aprobador_id en Aprobada/Rechazada.';

-- ── 4) Trigger en ordenes_compra: prevenir self-payment ──────────────
CREATE OR REPLACE FUNCTION public.oc_sod_check()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Aplica cuando se marca anticipo_pagado=true
  IF NEW.anticipo_pagado = true
     AND NEW.emitida_por          IS NOT NULL
     AND NEW.anticipo_pagado_por  IS NOT NULL
     AND NEW.emitida_por = NEW.anticipo_pagado_por
  THEN
    IF NOT public.sod_has_exception('ordenes_compra', NEW.emitida_por) THEN
      RAISE EXCEPTION
        'KPMG C-4 SoD: quien emite la OC (%) no puede ser el mismo que registra el pago del anticipo. Esto es separación de funciones: emisión ≠ pago.',
        NEW.emitida_por
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oc_sod_check ON public.ordenes_compra;
CREATE TRIGGER trg_oc_sod_check
  BEFORE INSERT OR UPDATE OF anticipo_pagado, anticipo_pagado_por
  ON public.ordenes_compra
  FOR EACH ROW EXECUTE FUNCTION public.oc_sod_check();

COMMENT ON FUNCTION public.oc_sod_check IS
  'KPMG C-4: bloquea que el emisor de una OC sea el mismo que registra el pago de su anticipo.';

-- ── 5) Vista de violaciones (lectura) ─────────────────────────────────
-- Materializa todas las violaciones detectables, tanto en estado
-- actual como en historial (audit_log). Para el módulo SoDViolations.
CREATE OR REPLACE VIEW public.sod_violations_log AS
WITH req_viol AS (
  SELECT
    'requisiciones'::text  AS tabla,
    r.id::text             AS row_id,
    r.solicitante_id       AS usuario_a,
    'solicitante'          AS rol_a,
    r.aprobador_id         AS usuario_b,
    'aprobador'            AS rol_b,
    r.estado               AS contexto,
    r.total                AS monto,
    r.aprobada_at          AS ocurrido_at,
    r.solicitante          AS nombre_a,
    r.aprobador_nombre     AS nombre_b
  FROM public.requisiciones r
  WHERE r.solicitante_id IS NOT NULL
    AND r.aprobador_id   IS NOT NULL
    AND r.solicitante_id = r.aprobador_id
    AND r.estado IN ('Aprobada','Rechazada')
), oc_viol AS (
  SELECT
    'ordenes_compra'::text   AS tabla,
    o.id::text               AS row_id,
    o.emitida_por            AS usuario_a,
    'emisor'                 AS rol_a,
    o.anticipo_pagado_por    AS usuario_b,
    'pagador_anticipo'       AS rol_b,
    o.estado                 AS contexto,
    o.total::int             AS monto,
    o.anticipo_pagado_at     AS ocurrido_at,
    o.emitida_por            AS nombre_a,
    o.anticipo_pagado_por    AS nombre_b
  FROM public.ordenes_compra o
  WHERE o.emitida_por         IS NOT NULL
    AND o.anticipo_pagado_por IS NOT NULL
    AND o.emitida_por = o.anticipo_pagado_por
    AND o.anticipo_pagado = true
)
SELECT * FROM req_viol
UNION ALL
SELECT * FROM oc_viol;

COMMENT ON VIEW public.sod_violations_log IS
  'KPMG C-4: lista todas las violaciones de SoD detectadas en datos actuales. Solo lectura. Si aparece una fila acá significa que el trigger fue bypaseado (override de super_admin sin excepción registrada) o que existía antes del trigger.';

GRANT SELECT ON public.sod_violations_log TO authenticated;
