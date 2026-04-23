-- Hotel habitaciones: inventario de habitaciones agrupadas por categoría
CREATE TABLE IF NOT EXISTS hotel_habitaciones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria   text NOT NULL,
  numero      text NOT NULL,
  capacidad   int DEFAULT 2,
  notas       text DEFAULT '',
  estado      text DEFAULT 'activa',  -- activa | inactiva | mantenimiento
  orden       int DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hotel_habitaciones_categoria ON hotel_habitaciones(categoria);

-- RLS: permitir anon (mismo patrón que otras tablas del sistema)
ALTER TABLE hotel_habitaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "habitaciones_anon_all" ON hotel_habitaciones;
CREATE POLICY "habitaciones_anon_all" ON hotel_habitaciones
  FOR ALL TO anon USING (true) WITH CHECK (true);

GRANT ALL ON hotel_habitaciones TO anon;
