-- Menú propio del evento — independiente de items_catalogo porque las
-- subcategorías (Barco, Entradas, PIZZAS, GRILL, SIDES) son específicas
-- del evento y los precios pueden diferir del catálogo normal.
CREATE TABLE IF NOT EXISTS cajas_evento_menu (
  id            text PRIMARY KEY,
  tipo          text NOT NULL CHECK (tipo IN ('comida','bebida')),
  subcategoria  text NOT NULL,
  nombre        text NOT NULL,
  precio        numeric NOT NULL DEFAULT 0,
  loggro_id     text,
  orden         int DEFAULT 0,
  activo        boolean DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cajas_evento_menu_tipo_idx ON cajas_evento_menu (tipo, subcategoria, orden);

ALTER TABLE cajas_evento_menu ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cajas_menu_all_anon ON cajas_evento_menu;
DROP POLICY IF EXISTS cajas_menu_all_auth ON cajas_evento_menu;
CREATE POLICY cajas_menu_all_anon ON cajas_evento_menu FOR ALL TO anon          USING (true) WITH CHECK (true);
CREATE POLICY cajas_menu_all_auth ON cajas_evento_menu FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Seed del menú COMIDA ─────────────────────────────────────────────
INSERT INTO cajas_evento_menu (id, tipo, subcategoria, nombre, precio, orden) VALUES
  ('MENU-COM-BAR-01', 'comida', 'Barco',    'Ceviche',            69000,  10),
  ('MENU-COM-BAR-02', 'comida', 'Barco',    'Cocktail Camarones', 65000,  20),
  ('MENU-COM-BAR-03', 'comida', 'Barco',    'Langosta',           115000, 30),
  ('MENU-COM-ENT-01', 'comida', 'Entradas', 'Chicharrón',         45000,  10),
  ('MENU-COM-ENT-02', 'comida', 'Entradas', 'Patacones',          30000,  20),
  ('MENU-COM-PIZ-01', 'comida', 'Pizzas',   'Margarita',          45000,  10),
  ('MENU-COM-PIZ-02', 'comida', 'Pizzas',   'Pepperoni',          53000,  20),
  ('MENU-COM-GRL-01', 'comida', 'Grill',    'Burger',             69000,  10),
  ('MENU-COM-GRL-02', 'comida', 'Grill',    'Pollo',              58000,  20),
  ('MENU-COM-GRL-03', 'comida', 'Grill',    'Lomo',               86000,  30),
  ('MENU-COM-GRL-04', 'comida', 'Grill',    'Pescado',            69000,  40),
  ('MENU-COM-GRL-05', 'comida', 'Grill',    'Pescado Frito',      69000,  50),
  ('MENU-COM-GRL-06', 'comida', 'Grill',    'Langosta Grill',     115000, 60),
  ('MENU-COM-SID-01', 'comida', 'Sides',    'Ensalada',           17000,  10),
  ('MENU-COM-SID-02', 'comida', 'Sides',    'Yuca',               18000,  20),
  ('MENU-COM-SID-03', 'comida', 'Sides',    'Papas Fritas',       18000,  30)
ON CONFLICT (id) DO UPDATE SET
  tipo          = EXCLUDED.tipo,
  subcategoria  = EXCLUDED.subcategoria,
  nombre        = EXCLUDED.nombre,
  precio        = EXCLUDED.precio,
  orden         = EXCLUDED.orden,
  updated_at    = now();
