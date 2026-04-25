-- Costeo de productos (COGS por pasadía/producto)
-- Cada producto tiene componentes con costo adulto/niño. El componente de
-- transporte se auto-calcula tomando el costo $/pax de la flota del mes.

CREATE TABLE IF NOT EXISTS public.productos_catalogo (
  id                    text PRIMARY KEY,
  codigo                text UNIQUE,
  nombre                text NOT NULL,
  categoria             text,            -- pasadia | hotel | evento | upsell | otro
  descripcion           text,
  precio_venta_adulto   numeric DEFAULT 0,
  precio_venta_nino     numeric DEFAULT 0,
  transporte_auto       boolean DEFAULT true,  -- si true, suma transporte calculado
  activo                boolean DEFAULT true,
  notas                 text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.producto_componentes (
  id            text PRIMARY KEY,
  producto_id   text NOT NULL REFERENCES public.productos_catalogo(id) ON DELETE CASCADE,
  nombre        text NOT NULL,
  costo_adulto  numeric DEFAULT 0,
  costo_nino    numeric DEFAULT 0,
  incluye_nino  boolean DEFAULT true,
  orden         int DEFAULT 0,
  notas         text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_componentes_producto ON public.producto_componentes(producto_id);
CREATE INDEX IF NOT EXISTS idx_productos_categoria  ON public.productos_catalogo(categoria);

ALTER TABLE public.productos_catalogo  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producto_componentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "productos_catalogo_all"  ON public.productos_catalogo;
DROP POLICY IF EXISTS "producto_componentes_all" ON public.producto_componentes;
CREATE POLICY "productos_catalogo_all" ON public.productos_catalogo
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "producto_componentes_all" ON public.producto_componentes
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
GRANT ALL ON public.productos_catalogo, public.producto_componentes TO anon, authenticated;

-- Seed inicial: VIP Pass con sus 5 componentes
INSERT INTO public.productos_catalogo (id, codigo, nombre, categoria, descripcion, transporte_auto)
VALUES
  ('PROD-VIP-PASS', 'VIP_PASS', 'VIP Pass',     'pasadia', 'Acceso VIP con transporte, amenidad, cocktail, almuerzo y toalla', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.producto_componentes (id, producto_id, nombre, costo_adulto, costo_nino, incluye_nino, orden, notas)
VALUES
  ('COMP-VIP-AMEN',     'PROD-VIP-PASS', 'Amenidad (toallita refrescante)', 0, 0, true,  10, 'A llenar'),
  ('COMP-VIP-COCKTAIL', 'PROD-VIP-PASS', 'Cocktail de bienvenida',          0, 0, false, 20, 'Adulto solamente'),
  ('COMP-VIP-ALMUERZO', 'PROD-VIP-PASS', 'Almuerzo (plato + postre)',       0, 0, true,  30, 'A llenar'),
  ('COMP-VIP-TOALLA',   'PROD-VIP-PASS', 'Toalla (lavada + reposición)',    0, 0, true,  40, 'Prorrateado por uso')
ON CONFLICT (id) DO NOTHING;
