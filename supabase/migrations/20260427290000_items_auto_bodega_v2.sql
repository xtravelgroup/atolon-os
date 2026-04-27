-- Mejora del trigger de auto-asignación: bebidas van a Almacén Bar Y Bar
-- (no solo al almacén). Las comidas van solo a Almacén Cocina (no hay LOC-COCINA).

-- Función helper: lista de bodegas a asignar según categoría
CREATE OR REPLACE FUNCTION public.bodegas_por_categoria(cat text)
RETURNS text[] AS $$
DECLARE
  c text := UPPER(COALESCE(cat, ''));
BEGIN
  -- Bebidas → Almacén Bar + Bar
  IF c LIKE '%CERVEZA%' OR c LIKE '%LICOR%' OR c LIKE '%RON%'
     OR c LIKE '%TEQUILA%' OR c LIKE '%VODKA%' OR c LIKE '%GIN%'
     OR c LIKE '%WHISKY%' OR c LIKE '%VINO%' OR c LIKE '%AGUARDIENTE%'
     OR c LIKE '%MEZCAL%' OR c LIKE '%COCTEL%' OR c LIKE '%SHOT%'
     OR c LIKE '%JUGO%' OR c LIKE '%GASEOSA%' OR c LIKE '%BEBIDA%'
     OR c LIKE '%PRODUCCION BAR%' OR c LIKE '%PRODUCCIÓN BAR%'
     OR c LIKE '%INSUMO%BAR%' OR c LIKE '%CHAMP%' OR c LIKE '%ESPUMOSO%'
  THEN
    RETURN ARRAY['LOC-ALMACEN-BAR', 'LOC-BAR'];
  END IF;

  -- Comida / Cocina → Almacén Cocina
  IF c LIKE '%COCINA%' OR c LIKE '%ALIMENT%' OR c LIKE '%PIZZA%'
     OR c LIKE '%TACO%' OR c LIKE '%POSTRE%' OR c LIKE '%PLATO%'
     OR c LIKE '%EMPANADA%' OR c LIKE '%COMIDA%' OR c LIKE '%MENU%'
     OR c LIKE '%YATE%' OR c LIKE '%INSUMO%' OR c LIKE '%PRODUCCION COCINA%'
     OR c LIKE '%PRODUCCIÓN COCINA%' OR c LIKE '%CARNE%' OR c LIKE '%FRUTA%'
     OR c LIKE '%VEGETAL%' OR c LIKE '%LACTEO%' OR c LIKE '%LÁCTEO%'
     OR c LIKE '%DESAYUNO%'
  THEN
    RETURN ARRAY['LOC-ALMACEN-COCINA'];
  END IF;

  -- Default: Almacén Cocina
  RETURN ARRAY['LOC-ALMACEN-COCINA'];
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Reemplazar el trigger AFTER INSERT con la lógica multi-bodega
CREATE OR REPLACE FUNCTION public.fn_auto_asignar_bodega()
RETURNS trigger AS $$
DECLARE
  v_locs text[];
  v_loc text;
BEGIN
  IF NEW.activo IS NOT TRUE THEN RETURN NEW; END IF;

  v_locs := public.bodegas_por_categoria(NEW.categoria);

  -- Solo asignar a bodegas que existan
  FOREACH v_loc IN ARRAY v_locs LOOP
    IF EXISTS (SELECT 1 FROM public.items_locaciones WHERE id = v_loc AND activa = true) THEN
      INSERT INTO public.items_stock_locacion (item_id, locacion_id, cantidad)
      VALUES (NEW.id, v_loc, 0)
      ON CONFLICT (item_id, locacion_id) DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Backfill: para items existentes activos cuya categoría sea bebida y NO
-- tengan fila en LOC-BAR, agregársela con cantidad 0.
INSERT INTO public.items_stock_locacion (item_id, locacion_id, cantidad)
SELECT c.id, 'LOC-BAR', 0
  FROM public.items_catalogo c
 WHERE c.activo = true
   AND 'LOC-BAR' = ANY(public.bodegas_por_categoria(c.categoria))
   AND NOT EXISTS (
     SELECT 1 FROM public.items_stock_locacion s
      WHERE s.item_id = c.id AND s.locacion_id = 'LOC-BAR'
   )
ON CONFLICT (item_id, locacion_id) DO NOTHING;
