-- Fusiona los duplicados creados al aplicar la factura DISLICORES con sus
-- originales en items_catalogo.
BEGIN;

CREATE TEMP TABLE fusiones (
  dup_id text PRIMARY KEY,
  orig_id text NOT NULL,
  dup_codigo_barras text,
  dup_referencia text,
  dup_proveedor text
);

INSERT INTO fusiones (dup_id, orig_id) VALUES
  ('ITM_1777298815054_j5gkn', 'ITEM-25ef7dfc'),
  ('ITM_1777298816896_zx2iq', 'ITEM-6dc34e6e'),
  ('ITM_1777298818312_5z490', 'ITEM-386c713e'),
  ('ITM_1777298820012_y9w4m', 'ITEM-d154836a'),
  ('ITM_1777298820483_vdek2', 'ITEM-4eebe6df'),
  ('ITM_1777298822592_htltz', 'ITEM-c034a231'),
  ('ITM_1777298823103_edjf9', 'ITEM-ae88bbe2'),
  ('ITM_1777298823538_1jcl4', 'ITEM-83f7f7fe'),
  ('ITM_1777298824423_umfje', 'ITEM-7e32f2b5'),
  ('ITM_1777298824824_c4xow', 'ITEM-aa6150e4'),
  ('ITM_1777298826893_yd8y8', 'ITEM-b97e8a87');

-- Mil976 Tonica Indi → Agua Tonica 1976 India (resolver dinámico)
INSERT INTO fusiones (dup_id, orig_id)
SELECT 'ITM_1777298827316_e6hb0', id
  FROM public.items_catalogo
 WHERE LOWER(nombre) = 'agua tonica 1976 india' AND activo = true LIMIT 1
ON CONFLICT (dup_id) DO NOTHING;

-- Guardar info del duplicado para copiarla después
UPDATE fusiones f
   SET dup_codigo_barras = d.codigo_barras,
       dup_referencia    = d.referencia_proveedor,
       dup_proveedor     = d.proveedor_principal_id
  FROM public.items_catalogo d
 WHERE d.id = f.dup_id;

-- 1. Mover items_proveedores del duplicado al original (sin conflicto)
UPDATE public.items_proveedores ip
   SET item_id = f.orig_id
  FROM fusiones f
 WHERE ip.item_id = f.dup_id
   AND NOT EXISTS (
     SELECT 1 FROM public.items_proveedores ip2
      WHERE ip2.item_id = f.orig_id
        AND COALESCE(ip2.proveedor_id, '') = COALESCE(ip.proveedor_id, '')
   );
DELETE FROM public.items_proveedores ip USING fusiones f WHERE ip.item_id = f.dup_id;

-- 2. items_stock_locacion: sumar cantidades en filas existentes
WITH stock_dup AS (
  SELECT f.orig_id, s.locacion_id, s.cantidad
    FROM public.items_stock_locacion s
    JOIN fusiones f ON f.dup_id = s.item_id
)
UPDATE public.items_stock_locacion s
   SET cantidad = s.cantidad + stock_dup.cantidad,
       updated_at = now()
  FROM stock_dup
 WHERE s.item_id = stock_dup.orig_id
   AND s.locacion_id = stock_dup.locacion_id;

-- Borrar todas las filas del duplicado (las que sumamos y las que no)
DELETE FROM public.items_stock_locacion s USING fusiones f WHERE s.item_id = f.dup_id;

-- 3. Borrar el item duplicado (libera codigo_barras unique)
DELETE FROM public.items_catalogo c USING fusiones f WHERE c.id = f.dup_id;

-- 4. AHORA copiar codigo_barras / referencia / proveedor al original
UPDATE public.items_catalogo o
   SET codigo_barras           = COALESCE(o.codigo_barras, f.dup_codigo_barras),
       referencia_proveedor     = COALESCE(o.referencia_proveedor, f.dup_referencia),
       proveedor_principal_id   = COALESCE(o.proveedor_principal_id, f.dup_proveedor),
       updated_at               = now()
  FROM fusiones f
 WHERE o.id = f.orig_id
   AND f.dup_codigo_barras IS NOT NULL;

-- 5. Tanqueray No.TEN queda como nuevo (no se fusiona — Ten ≠ Dry).
--    Arreglar categoría "Otros" → "VODKA / GIN" y asegurar bodegas Bar.
UPDATE public.items_catalogo
   SET categoria = 'VODKA / GIN', updated_at = now()
 WHERE id = 'ITM_1777298827741_p5wbj';

INSERT INTO public.items_stock_locacion (item_id, locacion_id, cantidad)
VALUES
  ('ITM_1777298827741_p5wbj', 'LOC-ALMACEN-BAR', 0),
  ('ITM_1777298827741_p5wbj', 'LOC-BAR', 0)
ON CONFLICT (item_id, locacion_id) DO NOTHING;

-- Reporte final
SELECT
  'Fusiones aplicadas: ' || COUNT(*) AS resultado
  FROM fusiones;

DROP TABLE fusiones;

COMMIT;
