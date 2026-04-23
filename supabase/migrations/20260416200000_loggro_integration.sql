-- Loggro integration: mesas cache + mapeo habitación → mesa + loggro_id en menu_items

-- Tabla cache de mesas de Loggro
CREATE TABLE IF NOT EXISTS loggro_mesas (
  loggro_id text PRIMARY KEY,
  nombre text NOT NULL,
  tipo text,
  activa boolean DEFAULT true,
  raw jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE loggro_mesas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "loggro_mesas_anon_read" ON loggro_mesas;
DROP POLICY IF EXISTS "loggro_mesas_auth_all" ON loggro_mesas;
CREATE POLICY "loggro_mesas_anon_read" ON loggro_mesas FOR SELECT TO anon USING (true);
CREATE POLICY "loggro_mesas_auth_all" ON loggro_mesas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Mapeo habitación → mesa de Loggro
ALTER TABLE hotel_habitaciones ADD COLUMN IF NOT EXISTS loggro_mesa_id text;
CREATE INDEX IF NOT EXISTS idx_hotel_habitaciones_loggro ON hotel_habitaciones(loggro_mesa_id);

-- menu_items: agregar loggro_id (para sincronización con Loggro)
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS loggro_id text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_items_loggro_id ON menu_items(loggro_id) WHERE loggro_id IS NOT NULL;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS raw jsonb;
