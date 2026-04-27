-- Backfill items_proveedores desde la factura DISLICORES ya aplicada
-- Esto se ejecuta una vez para corregir los datos que no se guardaron por el bug.
BEGIN;

-- Para cada item de la factura aplicada, buscar el item en catálogo por
-- codigo_barras (preferido) o codigo, y crear/actualizar items_proveedores.
WITH oc AS (
  SELECT id, proveedor_id, proveedor_nombre, factura_numero, factura_fecha, factura_data
    FROM public.ordenes_compra
   WHERE codigo = 'OC-2026-0001' AND factura_aplicada = true
), items_factura AS (
  SELECT
    oc.proveedor_id,
    oc.proveedor_nombre,
    oc.factura_numero,
    oc.factura_fecha,
    f.item->>'codigo_barras' AS codigo_barras,
    f.item->>'nombre'        AS nombre,
    GREATEST(COALESCE((f.item->>'unidades_por_paquete')::int, 1), 1) AS un_pack,
    COALESCE((f.item->>'precio_costo_pack')::numeric, 0)   AS costo_pack,
    COALESCE((f.item->>'es_bonificacion')::boolean, false) AS es_bonif,
    f.item->>'referencia_proveedor' AS ref_prov
  FROM oc, jsonb_array_elements(oc.factura_data->'items') AS f(item)
), match_catalogo AS (
  SELECT
    iff.*,
    COALESCE(
      (SELECT id FROM public.items_catalogo WHERE codigo_barras = iff.codigo_barras LIMIT 1),
      (SELECT id FROM public.items_catalogo WHERE codigo = iff.codigo_barras LIMIT 1),
      (SELECT id FROM public.items_catalogo WHERE LOWER(nombre) = LOWER(iff.nombre) LIMIT 1)
    ) AS item_id_match,
    -- precio individual = costo_pack / unidades_por_paquete
    CASE WHEN iff.un_pack > 0
         THEN ROUND(iff.costo_pack / iff.un_pack)
         ELSE 0 END AS precio_unit_individual
  FROM items_factura iff
)
INSERT INTO public.items_proveedores (id, item_id, proveedor_id, proveedor_nombre, precio, es_principal, notas, updated_at)
SELECT
  gen_random_uuid(),
  m.item_id_match,
  m.proveedor_id,
  m.proveedor_nombre,
  m.precio_unit_individual,
  true,        -- DISLICORES como principal
  'Factura ' || m.factura_numero || ' (' || m.factura_fecha || ') · backfill',
  now()
FROM match_catalogo m
WHERE m.item_id_match IS NOT NULL
  AND NOT m.es_bonif
  AND m.precio_unit_individual > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.items_proveedores ip
     WHERE ip.item_id = m.item_id_match
       AND ip.proveedor_id = m.proveedor_id
  );

-- También sincronizar items_catalogo.precio_compra con el costo individual
UPDATE public.items_catalogo c
   SET precio_compra        = m.precio_unit_individual,
       unidades_por_paquete = m.un_pack,
       updated_at           = now()
  FROM (
    SELECT DISTINCT ON (item_id_match)
      item_id_match, precio_unit_individual, un_pack
    FROM (
      SELECT
        COALESCE(
          (SELECT id FROM public.items_catalogo WHERE codigo_barras = f.item->>'codigo_barras' LIMIT 1),
          (SELECT id FROM public.items_catalogo WHERE codigo = f.item->>'codigo_barras' LIMIT 1),
          (SELECT id FROM public.items_catalogo WHERE LOWER(nombre) = LOWER(f.item->>'nombre') LIMIT 1)
        ) AS item_id_match,
        CASE WHEN GREATEST(COALESCE((f.item->>'unidades_por_paquete')::int, 1), 1) > 0
             THEN ROUND(COALESCE((f.item->>'precio_costo_pack')::numeric, 0) / GREATEST(COALESCE((f.item->>'unidades_por_paquete')::int, 1), 1))
             ELSE 0 END AS precio_unit_individual,
        GREATEST(COALESCE((f.item->>'unidades_por_paquete')::int, 1), 1) AS un_pack,
        COALESCE((f.item->>'es_bonificacion')::boolean, false) AS es_bonif
      FROM public.ordenes_compra oc, jsonb_array_elements(oc.factura_data->'items') AS f(item)
      WHERE oc.codigo = 'OC-2026-0001' AND oc.factura_aplicada = true
    ) sub
    WHERE item_id_match IS NOT NULL AND NOT es_bonif AND precio_unit_individual > 0
    ORDER BY item_id_match, precio_unit_individual DESC
  ) m
 WHERE c.id = m.item_id_match;

-- Reportar
SELECT COUNT(*) AS items_proveedores_creados
  FROM public.items_proveedores
 WHERE notas LIKE 'Factura 02FE266813%backfill%';

COMMIT;
