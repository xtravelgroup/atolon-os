-- H-7 · Vincular OCs a sus requisiciones origen
-- =====================================================================
-- Hallazgo: 199 de 200 OCs tienen el campo `requisicion_ids` vacío,
-- pero las 199 mencionan "Consolidado desde REQ-XXXXX" en notas.text
-- = bug de tracking del código que crea OC desde requisición consolidada.
--
-- Backfill: parsear todas las referencias REQ-XXXXX de notas y poblar
-- el campo jsonb estructurado. Solo se actualizan las que estaban
-- vacías (no se pisa nada existente).
-- =====================================================================

WITH parsed AS (
  SELECT
    o.id AS oc_id,
    (
      SELECT jsonb_agg(DISTINCT m[1])
      FROM regexp_matches(o.notas, 'REQ-[0-9]+', 'g') AS m
    ) AS req_ids
  FROM public.ordenes_compra o
  WHERE (o.requisicion_ids IS NULL OR jsonb_array_length(o.requisicion_ids) = 0)
    AND o.notas ~ 'REQ-[0-9]+'
)
UPDATE public.ordenes_compra o
SET requisicion_ids = parsed.req_ids,
    updated_at = now()
FROM parsed
WHERE o.id = parsed.oc_id
  AND parsed.req_ids IS NOT NULL;

-- Validar que las REQ extraídas existen realmente en requisiciones
-- (no romper, solo reportar — devuelve cuántas referencias huérfanas
-- quedaron para investigar manualmente)
DO $$
DECLARE
  huerfanos int;
  total_links int;
BEGIN
  SELECT COUNT(DISTINCT req_id) INTO huerfanos
  FROM (
    SELECT jsonb_array_elements_text(o.requisicion_ids) AS req_id
    FROM public.ordenes_compra o
    WHERE o.requisicion_ids IS NOT NULL
      AND jsonb_array_length(o.requisicion_ids) > 0
  ) refs
  LEFT JOIN public.requisiciones r ON r.id = refs.req_id
  WHERE r.id IS NULL;

  SELECT COALESCE(SUM(jsonb_array_length(requisicion_ids)), 0) INTO total_links
  FROM public.ordenes_compra
  WHERE requisicion_ids IS NOT NULL;

  RAISE NOTICE 'Backfill completado. Total links creados: %. Referencias huérfanas (REQ-xxx no encontradas en tabla requisiciones): %', total_links, huerfanos;
END $$;
