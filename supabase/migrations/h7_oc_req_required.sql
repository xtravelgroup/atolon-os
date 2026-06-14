-- Control interno H-7 · Toda OC debe tener requisición previa
-- =====================================================================
-- Trigger preventivo: bloquea INSERT/UPDATE de OC que pase a estado
-- 'enviada' (o cualquier estado posterior) sin tener requisicion_ids
-- poblado.
--
-- Excepciones contempladas:
--   - Estado 'emitida' (borrador) puede crearse sin req — el agente
--     de compras la enlaza después.
--   - OCs por debajo del umbral de petty cash (configurable).
-- =====================================================================

-- Umbral de petty cash: por debajo, no se exige requisición.
-- Configurable vía configuracion.petty_cash_threshold (default $100K).
CREATE OR REPLACE FUNCTION public.oc_req_check()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  threshold numeric := 100000;  -- default $100K
  cnt_req int;
BEGIN
  -- Leer threshold desde configuracion si existe
  BEGIN
    SELECT COALESCE((value::text)::numeric, threshold) INTO threshold
    FROM public.configuracion WHERE id = 'atolon'
    AND value IS NOT NULL
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    -- columna value no es jsonb o no tiene el campo, usar default
    NULL;
  END;

  -- Solo controlar al pasar a 'enviada' o estados posteriores
  IF NEW.estado NOT IN ('enviada','confirmada','recibida','recibida_parcial','pagada','anticipo_pendiente','cerrada') THEN
    RETURN NEW;
  END IF;

  -- Excepción de petty cash
  IF NEW.total IS NOT NULL AND NEW.total < threshold THEN
    RETURN NEW;
  END IF;

  -- Validar que tenga requisicion_ids poblado
  cnt_req := COALESCE(jsonb_array_length(NEW.requisicion_ids), 0);

  IF cnt_req = 0 AND NEW.requisicion_id IS NULL THEN
    RAISE EXCEPTION
      'Control interno H-7: la OC % (%) no se puede enviar sin requisición previa. Vincular al menos una requisición aprobada antes de cambiar a estado %.',
      NEW.id, COALESCE(NEW.codigo, '?'), NEW.estado
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_oc_req_check ON public.ordenes_compra;
CREATE TRIGGER trg_oc_req_check
  BEFORE INSERT OR UPDATE OF estado, requisicion_ids
  ON public.ordenes_compra
  FOR EACH ROW EXECUTE FUNCTION public.oc_req_check();

COMMENT ON FUNCTION public.oc_req_check IS
  'Control interno H-7: impide enviar OCs sin requisición previa. Excepción: petty cash bajo el umbral configurable.';

-- ── Vista de OCs sin req — para el módulo Compras y revisores ────────
CREATE OR REPLACE VIEW public.oc_sin_requisicion AS
SELECT
  o.id, o.codigo, o.proveedor_nombre, o.estado,
  o.total::bigint AS monto,
  o.fecha_emision, o.emitida_por,
  o.notas,
  CASE
    WHEN o.notas ~ 'REQ-[0-9]+' THEN 'req_en_notas_no_vinculado'
    WHEN o.total < 100000        THEN 'petty_cash'
    ELSE 'bypass_real'
  END AS categoria
FROM public.ordenes_compra o
WHERE (o.requisicion_ids IS NULL OR jsonb_array_length(o.requisicion_ids) = 0)
  AND o.requisicion_id IS NULL
  AND o.estado IN ('enviada','confirmada','recibida','recibida_parcial','pagada','anticipo_pendiente','cerrada');

GRANT SELECT ON public.oc_sin_requisicion TO authenticated;

COMMENT ON VIEW public.oc_sin_requisicion IS
  'Control interno H-7: OCs activas sin requisición vinculada, clasificadas por categoría. Después del backfill debería estar vacía.';
