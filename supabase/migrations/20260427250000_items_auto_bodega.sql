-- Cuando se crea un item nuevo, asignarlo automáticamente a una bodega
-- por defecto basado en su categoría. Esto resuelve el problema de items
-- "huérfanos" que no aparecen en Hacer Inventario.

CREATE OR REPLACE FUNCTION public.bodega_por_categoria(cat text)
RETURNS text AS $$
DECLARE
  c text := UPPER(COALESCE(cat, ''));
BEGIN
  -- Bebidas
  IF c LIKE '%CERVEZA%' OR c LIKE '%LICOR%' OR c LIKE '%RON%'
     OR c LIKE '%TEQUILA%' OR c LIKE '%VODKA%' OR c LIKE '%GIN%'
     OR c LIKE '%WHISKY%' OR c LIKE '%VINO%' OR c LIKE '%AGUARDIENTE%'
     OR c LIKE '%MEZCAL%' OR c LIKE '%COCTEL%' OR c LIKE '%SHOT%'
     OR c LIKE '%JUGO%' OR c LIKE '%GASEOSA%' OR c LIKE '%BEBIDA%'
     OR c LIKE '%PRODUCCION BAR%' OR c LIKE '%PRODUCCIÓN BAR%'
     OR c LIKE '%INSUMO%BAR%' OR c LIKE '%CHAMP%' OR c LIKE '%ESPUMOSO%'
  THEN
    RETURN 'LOC-ALMACEN-BAR';
  END IF;

  -- Comida / Cocina
  IF c LIKE '%COCINA%' OR c LIKE '%ALIMENT%' OR c LIKE '%PIZZA%'
     OR c LIKE '%TACO%' OR c LIKE '%POSTRE%' OR c LIKE '%PLATO%'
     OR c LIKE '%EMPANADA%' OR c LIKE '%COMIDA%' OR c LIKE '%MENU%'
     OR c LIKE '%YATE%' OR c LIKE '%INSUMO%' OR c LIKE '%PRODUCCION COCINA%'
     OR c LIKE '%PRODUCCIÓN COCINA%' OR c LIKE '%CARNE%' OR c LIKE '%FRUTA%'
     OR c LIKE '%VEGETAL%' OR c LIKE '%LACTEO%' OR c LIKE '%LÁCTEO%'
  THEN
    RETURN 'LOC-ALMACEN-COCINA';
  END IF;

  -- Default: cocina (la mayoría de cosas son insumos)
  RETURN 'LOC-ALMACEN-COCINA';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger que crea la fila en items_stock_locacion al insertar un item activo
CREATE OR REPLACE FUNCTION public.fn_auto_asignar_bodega()
RETURNS trigger AS $$
DECLARE
  v_loc text;
BEGIN
  IF NEW.activo IS NOT TRUE THEN RETURN NEW; END IF;

  v_loc := public.bodega_por_categoria(NEW.categoria);

  INSERT INTO public.items_stock_locacion (item_id, locacion_id, cantidad)
  VALUES (NEW.id, v_loc, 0)
  ON CONFLICT (item_id, locacion_id) DO NOTHING;

  -- Inventario General (si existe) — asignar también para que apareza en sync
  INSERT INTO public.items_stock_locacion (item_id, locacion_id, cantidad)
  SELECT NEW.id, 'LOC-INVENTARIO-GENERAL', 0
  WHERE EXISTS (SELECT 1 FROM public.items_locaciones WHERE id = 'LOC-INVENTARIO-GENERAL')
  ON CONFLICT (item_id, locacion_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_asignar_bodega ON public.items_catalogo;
CREATE TRIGGER trg_auto_asignar_bodega
  AFTER INSERT ON public.items_catalogo
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_asignar_bodega();

-- Backfill: para items existentes sin location, crear su fila default
INSERT INTO public.items_stock_locacion (item_id, locacion_id, cantidad)
SELECT c.id, public.bodega_por_categoria(c.categoria), 0
  FROM public.items_catalogo c
 WHERE c.activo = true
   AND NOT EXISTS (
     SELECT 1 FROM public.items_stock_locacion s WHERE s.item_id = c.id
   )
ON CONFLICT (item_id, locacion_id) DO NOTHING;

-- También agregar al Inventario General (si existe)
INSERT INTO public.items_stock_locacion (item_id, locacion_id, cantidad)
SELECT c.id, 'LOC-INVENTARIO-GENERAL', 0
  FROM public.items_catalogo c
 WHERE c.activo = true
   AND EXISTS (SELECT 1 FROM public.items_locaciones WHERE id = 'LOC-INVENTARIO-GENERAL')
   AND NOT EXISTS (
     SELECT 1 FROM public.items_stock_locacion s
      WHERE s.item_id = c.id AND s.locacion_id = 'LOC-INVENTARIO-GENERAL'
   )
ON CONFLICT (item_id, locacion_id) DO NOTHING;
