-- Reset a 0 todo el stock de items que NO fueron contados hoy.
-- Solo los items que aparecen en los 3 conteos del 27 abril (Cocina + 2 Bar)
-- conservan su cantidad — el resto se cae a 0.
--
-- Conteos del día:
--   CNT-1777304649615  Almacén Cocina (Meris) — 254 items
--   CNT-1777306802189  Almacén Bar (Andrea, fusionado) — 88 items
--   CNT-1777312713049  Bar (Andrea, fusionado)  — 89 items

BEGIN;

-- Construir set de pares (item_id, locacion_id) que SÍ se contaron
WITH contados AS (
  SELECT
    (it->>'item_id') AS item_id,
    locacion_id
    FROM public.items_conteos co,
         jsonb_array_elements(co.items) AS it
   WHERE co.id IN ('CNT-1777304649615', 'CNT-1777306802189', 'CNT-1777312713049')
)
-- Resetear a 0 las filas que NO están en contados
UPDATE public.items_stock_locacion s
   SET cantidad = 0,
       updated_at = now()
 WHERE NOT EXISTS (
   SELECT 1 FROM contados c
    WHERE c.item_id = s.item_id
      AND c.locacion_id = s.locacion_id
 )
 AND s.cantidad > 0;

-- Reporte
SELECT
  'Items con stock > 0 (post-reset)'  AS metrica,
  COUNT(*) AS valor
  FROM public.items_stock_locacion
 WHERE cantidad > 0
UNION ALL
SELECT 'Items con stock = 0',
       COUNT(*)
  FROM public.items_stock_locacion
 WHERE cantidad = 0
UNION ALL
SELECT 'Items con stock < 0',
       COUNT(*)
  FROM public.items_stock_locacion
 WHERE cantidad < 0;

COMMIT;
