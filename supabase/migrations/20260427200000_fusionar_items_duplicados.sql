-- Fusiona items duplicados creados al aplicar factura DISLICORES
BEGIN;

-- 1. Identificar duplicados ITM_* que tienen un ITEM-* hermano con mismo `codigo`
CREATE TEMP TABLE duplicados_a_fusionar AS
SELECT
  nuevo.id                 AS nuevo_id,
  original.id              AS original_id,
  nuevo.codigo_barras      AS d_codigo_barras,
  nuevo.precio_compra      AS d_precio_compra,
  COALESCE(nuevo.unidades_por_paquete, 1) AS d_unidades_por_paquete,
  nuevo.unidad_compra      AS d_unidad_compra,
  nuevo.unidad_individual  AS d_unidad_individual,
  nuevo.referencia_proveedor       AS d_ref,
  nuevo.proveedor_principal_id     AS d_prov_principal
FROM public.items_catalogo nuevo
INNER JOIN public.items_catalogo original
  ON nuevo.codigo = original.codigo
  AND nuevo.id LIKE 'ITM\_%' ESCAPE '\'
  AND original.id LIKE 'ITEM-%'
  AND nuevo.id <> original.id
  AND original.codigo_barras IS NULL;

-- 2. Mover items_proveedores del duplicado al original (ANTES de borrar)
--    Si ya existe relación con el mismo proveedor en el original, evitar conflicto
UPDATE public.items_proveedores ip
   SET item_id = d.original_id
  FROM duplicados_a_fusionar d
 WHERE ip.item_id = d.nuevo_id
   AND NOT EXISTS (
     SELECT 1 FROM public.items_proveedores ip2
      WHERE ip2.item_id = d.original_id
        AND COALESCE(ip2.proveedor_id, '') = COALESCE(ip.proveedor_id, '')
   );

-- Eliminar las que sí tendrían conflicto (el original ya tenía)
DELETE FROM public.items_proveedores ip
 USING duplicados_a_fusionar d
 WHERE ip.item_id = d.nuevo_id;

-- 3. Borrar items duplicados (libera el codigo_barras)
DELETE FROM public.items_catalogo
 WHERE id IN (SELECT nuevo_id FROM duplicados_a_fusionar);

-- 4. Ahora podemos actualizar los originales sin conflicto del unique index
UPDATE public.items_catalogo c
   SET codigo_barras            = d.d_codigo_barras,
       precio_compra            = d.d_precio_compra,
       unidades_por_paquete     = d.d_unidades_por_paquete,
       unidad_compra            = COALESCE(d.d_unidad_compra, c.unidad_compra),
       unidad_individual        = COALESCE(d.d_unidad_individual, c.unidad_individual),
       referencia_proveedor     = COALESCE(d.d_ref, c.referencia_proveedor),
       proveedor_principal_id   = COALESCE(d.d_prov_principal, c.proveedor_principal_id),
       updated_at               = now()
  FROM duplicados_a_fusionar d
 WHERE c.id = d.original_id;

-- 5. Para items con codigo numérico EAN-like pero codigo_barras NULL, copiar
UPDATE public.items_catalogo
   SET codigo_barras = codigo
 WHERE codigo_barras IS NULL
   AND codigo IS NOT NULL
   AND codigo ~ '^[0-9]{8,14}$'
   AND NOT EXISTS (
     SELECT 1 FROM public.items_catalogo c2
      WHERE c2.codigo_barras = items_catalogo.codigo
   );

DROP TABLE duplicados_a_fusionar;

COMMIT;
