-- Control interno H-6 · Aprobación por umbral de monto
-- =====================================================================
-- Hallazgo: las reglas en req_reglas_aprobacion usaban literal
-- "gerente_general_op" como rol_aprobador, pero el rol real en BD es
-- "gerente_general_1775236379654" (instancia con sufijo de timestamp).
-- Resultado: el matching nunca se hacía y el control era inerte.
--
-- Cambios:
--   1. rol_aprobador ahora soporta patrones (LIKE) — % al final
--   2. Función req_rol_satisface_regla(rol_id, monto) chequea si un
--      rol cubre el monto dado
--   3. Trigger en requisiciones: al pasar a 'Aprobada', validar
--      contra la matriz. super_admin siempre puede aprobar todo.
-- =====================================================================

-- 1) Normalizar las reglas existentes a patrones LIKE
UPDATE public.req_reglas_aprobacion SET rol_aprobador = 'gerente_general_%'
WHERE rol_aprobador = 'gerente_general_op';

-- 2) Helper: ¿este rol cumple alguna regla activa para este monto?
CREATE OR REPLACE FUNCTION public.req_rol_satisface_regla(p_rol text, p_monto numeric)
RETURNS boolean
LANGUAGE plpgsql STABLE AS $$
DECLARE
  r record;
BEGIN
  -- super_admin y admin siempre pueden
  IF p_rol IS NOT NULL AND (p_rol = 'super_admin' OR p_rol = 'admin') THEN
    RETURN true;
  END IF;

  -- Encontrar la(s) regla(s) cuya banda cubre el monto
  FOR r IN
    SELECT rol_aprobador
    FROM public.req_reglas_aprobacion
    WHERE activo = true
      AND COALESCE(monto_min, 0) <= p_monto
      AND (monto_max IS NULL OR p_monto < monto_max)
  LOOP
    -- Match LIKE si la regla tiene %
    IF r.rol_aprobador LIKE '%\%%' THEN
      IF p_rol LIKE r.rol_aprobador THEN RETURN true; END IF;
    ELSE
      IF p_rol = r.rol_aprobador THEN RETURN true; END IF;
    END IF;
  END LOOP;

  RETURN false;
END $$;

-- 3) Trigger preventivo: bloquear aprobación de req si el aprobador
--    no cumple la regla por monto
CREATE OR REPLACE FUNCTION public.req_aprobador_check()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  rol_actual text;
BEGIN
  -- Solo aplica cuando estado pasa a 'Aprobada'
  IF NEW.estado != 'Aprobada' OR (OLD.estado = NEW.estado AND OLD.aprobador_id = NEW.aprobador_id) THEN
    RETURN NEW;
  END IF;

  -- Excepción de bajo monto (< $200K, mismo umbral que la primera regla)
  IF NEW.total IS NOT NULL AND NEW.total < 200000 THEN
    RETURN NEW;
  END IF;

  -- Resolver rol del aprobador
  SELECT rol_id INTO rol_actual FROM public.usuarios WHERE id = NEW.aprobador_id;

  IF rol_actual IS NULL THEN
    RAISE EXCEPTION
      'Control interno H-6: aprobador % no existe en la tabla usuarios.',
      NEW.aprobador_id
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.req_rol_satisface_regla(rol_actual, NEW.total) THEN
    RAISE EXCEPTION
      'Control interno H-6: el rol "%" no tiene autoridad para aprobar requisiciones de $%. Consultá la matriz de aprobación (módulo Requisiciones → Reglas).',
      rol_actual, NEW.total::bigint
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_req_aprobador_check ON public.requisiciones;
CREATE TRIGGER trg_req_aprobador_check
  BEFORE UPDATE OF estado, aprobador_id
  ON public.requisiciones
  FOR EACH ROW EXECUTE FUNCTION public.req_aprobador_check();

COMMENT ON FUNCTION public.req_aprobador_check IS
  'Control interno H-6: bloquea aprobación de requisiciones si el rol del aprobador no cubre el monto según matriz req_reglas_aprobacion.';

-- 4) Vista de bypass histórico
CREATE OR REPLACE VIEW public.req_aprobacion_bypass AS
WITH reqs AS (
  SELECT
    r.id, r.total::bigint AS monto, r.estado,
    r.aprobador_id, r.aprobada_at, r.aprobador_nombre,
    u.rol_id AS rol_aprobador_actual
  FROM public.requisiciones r
  LEFT JOIN public.usuarios u ON u.id = r.aprobador_id
  WHERE r.aprobador_id IS NOT NULL AND r.total > 0
)
SELECT
  reqs.*,
  CASE
    WHEN public.req_rol_satisface_regla(reqs.rol_aprobador_actual, reqs.monto) THEN 'ok'
    ELSE 'bypass'
  END AS estado_control
FROM reqs;

GRANT SELECT ON public.req_aprobacion_bypass TO authenticated;

COMMENT ON VIEW public.req_aprobacion_bypass IS
  'Control interno H-6: estado de cumplimiento de la matriz de aprobación por requisición. Filtrar WHERE estado_control = bypass para auditar.';
