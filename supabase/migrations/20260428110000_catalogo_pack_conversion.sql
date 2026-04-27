-- Manejo de empaques (sixpack, bandeja, caja) → unidades individuales
-- En Atolón el inventario se cuenta SIEMPRE en unidades individuales.
-- Los proveedores facturan por empaque (24 sixpacks = 144 cervezas individuales).
-- El sistema usa unidades_por_paquete para hacer la conversión automática.
ALTER TABLE public.items_catalogo
  ADD COLUMN IF NOT EXISTS unidades_por_paquete int DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unidad_individual    text,         -- "BOTELLA", "LATA", "UNIDAD"
  ADD COLUMN IF NOT EXISTS unidad_compra        text;         -- "SIXPACK", "BANDEJA X 12", "UND"

COMMENT ON COLUMN public.items_catalogo.unidades_por_paquete IS
  'Cuántas unidades individuales tiene el empaque que se compra. Ej: sixpack = 6.';
COMMENT ON COLUMN public.items_catalogo.unidad_individual IS
  'Cómo se cuenta en el inventario (BOTELLA, LATA). El stock siempre se lleva así.';
COMMENT ON COLUMN public.items_catalogo.unidad_compra IS
  'Cómo se compra al proveedor (SIXPACK, BANDEJA, UND). Solo informativo.';

-- Garantizar que el factor sea positivo
ALTER TABLE public.items_catalogo
  DROP CONSTRAINT IF EXISTS items_catalogo_unidades_paquete_positive;
ALTER TABLE public.items_catalogo
  ADD CONSTRAINT items_catalogo_unidades_paquete_positive
  CHECK (unidades_por_paquete >= 1);
