-- Grupo padre para categorías de productos: Alimentos | Bebidas | Otros
-- Permite agrupar visualmente y filtrar reportes Comida vs Bebida.
ALTER TABLE public.items_categorias
  ADD COLUMN IF NOT EXISTS grupo text DEFAULT 'otros';

CREATE INDEX IF NOT EXISTS idx_items_categorias_grupo ON public.items_categorias(grupo);

-- Auto-asignar grupos según las categorías existentes
UPDATE public.items_categorias SET grupo = 'alimentos'
WHERE id IN (
  'ICAT-0a3790',  -- Insumos cocina
  'ICAT-40477b',  -- PRODUCCION COCINA
  'ICAT-a7af83',  -- ENTRADAS Y ENSALADAS
  'ICAT-e21044',  -- PLATOS PRINCIPALES
  'ICAT-f0b8ff',  -- PIZZAS Y TACOS
  'ICAT-b3133a',  -- COMPLEMENTOS Y ADICIONALES
  'ICAT-198d4f',  -- POSTRES
  'ICAT-6f0c09',  -- FULL YATE MENU
  'ICAT-888d2c'   -- Desayuno
);

UPDATE public.items_categorias SET grupo = 'bebidas'
WHERE id IN (
  'ICAT-370e6f',  -- Producción BAR
  'ICAT-fdcb02',  -- BEBIDAS
  'ICAT-410f68',  -- BEBIDA CALIENTES
  'ICAT-8cb97e',  -- Jugos
  'ICAT-fb5da8',  -- CERVEZAS
  'ICAT-78b449',  -- BOTELLAS
  'ICAT-7f39ef',  -- RON
  'ICAT-371baa',  -- TEQUILA / MEZCAL
  'ICAT-943d51',  -- WHISKY / BOURBON
  'ICAT-8285df',  -- VODKA / GIN
  'ICAT-552c44',  -- LICORES
  'ICAT-177359',  -- VINOS / ESPUMOSOS
  'ICAT-95633b'   -- Shots
);

-- Las categorías Otros, Repuestos Motores y futuras quedan como 'otros' (default)
