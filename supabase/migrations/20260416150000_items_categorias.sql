-- Categorías dinámicas para Items
CREATE TABLE IF NOT EXISTS items_categorias (
  id text PRIMARY KEY DEFAULT 'ICAT-' || substr(md5(random()::text),1,6),
  nombre text NOT NULL UNIQUE,
  icon text DEFAULT '📦',
  color text DEFAULT '#888888',
  orden int DEFAULT 0,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Seed con las categorías iniciales
INSERT INTO items_categorias (nombre, icon, color, orden) VALUES
  ('Alimentos',      '🍳', '#f59e0b', 1),
  ('Bar',            '🍹', '#a78bfa', 2),
  ('Ama de Llaves',  '🛏️', '#34d399', 3),
  ('Mantenimiento',  '🔧', '#f97316', 4),
  ('Comercial',      '📊', '#38bdf8', 5),
  ('Contabilidad',   '📒', '#fbbf24', 6),
  ('Flota',          '🚤', '#06b6d4', 7),
  ('Otros',          '📦', '#888888', 8)
ON CONFLICT (nombre) DO NOTHING;

-- RLS
ALTER TABLE items_categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items_categorias_anon_read" ON items_categorias FOR SELECT TO anon USING (true);
CREATE POLICY "items_categorias_auth_all" ON items_categorias FOR ALL TO authenticated USING (true) WITH CHECK (true);
