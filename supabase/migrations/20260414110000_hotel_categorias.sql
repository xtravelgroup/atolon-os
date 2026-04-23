-- Add hotel_categorias table and link habitaciones to it
CREATE TABLE IF NOT EXISTS hotel_categorias (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre              text NOT NULL UNIQUE,
  capacidad_incluida  int DEFAULT 2,
  capacidad_maxima    int DEFAULT 2,
  camas               jsonb DEFAULT '[]'::jsonb, -- [{ cantidad, tipo }]
  descripcion         text DEFAULT '',
  orden               int DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE hotel_categorias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "categorias_anon_all" ON hotel_categorias;
CREATE POLICY "categorias_anon_all" ON hotel_categorias FOR ALL TO anon USING (true) WITH CHECK (true);
GRANT ALL ON hotel_categorias TO anon;

-- Link habitaciones to categorias via categoria_id (keep categoria text for backwards compat / display)
ALTER TABLE hotel_habitaciones ADD COLUMN IF NOT EXISTS categoria_id uuid REFERENCES hotel_categorias(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_hotel_habitaciones_categoria_id ON hotel_habitaciones(categoria_id);
