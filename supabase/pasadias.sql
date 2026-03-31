-- ============================================
-- PASADIAS — Productos, Embarcaciones, Salidas, Cierres
-- ============================================

-- 1. Tipos de pasadia (productos configurables)
CREATE TABLE IF NOT EXISTS pasadias (
  id text PRIMARY KEY,
  nombre text NOT NULL,
  precio integer NOT NULL DEFAULT 0,
  descripcion text,
  incluye text,
  min_pax integer DEFAULT 1,
  web_publica boolean DEFAULT true,
  activo boolean DEFAULT true,
  orden integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Embarcaciones (flota)
CREATE TABLE IF NOT EXISTS embarcaciones (
  id text PRIMARY KEY,
  nombre text NOT NULL,
  tipo text,
  capacidad integer NOT NULL DEFAULT 0,
  estado text DEFAULT 'activo' check (estado in ('activo','mantenimiento','inactivo')),
  capitan text,
  notas text,
  foto_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Salidas (slots de horario con botes asignados)
CREATE TABLE IF NOT EXISTS salidas (
  id text PRIMARY KEY,
  hora text NOT NULL,
  hora_regreso text,
  nombre text,
  embarcaciones text[] DEFAULT '{}',
  capacidad_total integer DEFAULT 0,
  auto_apertura boolean DEFAULT false,
  auto_umbral integer DEFAULT 90,
  activo boolean DEFAULT true,
  orden integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. Cierres ya existe, pero agreguemos referencia a salidas
-- (tabla cierres ya creada en all-tables.sql)

-- Triggers
DROP TRIGGER IF EXISTS set_updated_at ON pasadias;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON pasadias FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON embarcaciones;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON embarcaciones FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON salidas;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON salidas FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE pasadias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_pasadias" ON pasadias FOR ALL TO anon USING (true) WITH CHECK (true);
ALTER TABLE embarcaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_embarcaciones" ON embarcaciones FOR ALL TO anon USING (true) WITH CHECK (true);
ALTER TABLE salidas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_salidas" ON salidas FOR ALL TO anon USING (true) WITH CHECK (true);

-- 5. Seed: Los 4 pasadias
INSERT INTO pasadias (id, nombre, precio, descripcion, incluye, min_pax, web_publica, activo, orden) VALUES
('PAS-VIP', 'VIP Pass', 320000, 'Acceso VIP al club con todas las amenidades premium', 'Transporte ida/vuelta, acceso piscina, playa, bar, almuerzo', 1, true, true, 1),
('PAS-EXC', 'Exclusive Pass', 590000, 'Experiencia exclusiva con servicio personalizado', 'Todo VIP + cabana privada, servicio de mesero dedicado, cocteleria premium', 2, true, true, 2),
('PAS-EXP', 'Atolon Experience', 1100000, 'La experiencia completa Atolon para grupos', 'Todo Exclusive + tour en yate, snorkeling, menu degustacion, DJ', 4, true, true, 3),
('PAS-AFT', 'After Island', 170000, 'Entrada tarde con acceso a playa y bar', 'Transporte regreso, acceso playa, bar desde las 13:00', 1, false, true, 4)
ON CONFLICT (id) DO NOTHING;

-- 6. Seed: Flota
INSERT INTO embarcaciones (id, nombre, tipo, capacidad, estado, capitan) VALUES
('B01', 'Caribe I', 'Lancha 24''', 12, 'activo', 'Carlos Mendoza'),
('B02', 'Coral II', 'Lancha 28''', 18, 'activo', 'Pedro Gomez'),
('B03', 'Atolon III', 'Yate 42''', 30, 'activo', 'Ricardo Leal'),
('B04', 'Sunrise', 'Lancha 20''', 8, 'mantenimiento', null),
('B05', 'Palmera', 'Catamaran 38''', 25, 'activo', 'Andres Rivera')
ON CONFLICT (id) DO NOTHING;

-- 7. Seed: Salidas
INSERT INTO salidas (id, hora, hora_regreso, nombre, embarcaciones, capacidad_total, auto_apertura, activo, orden) VALUES
('S1', '08:30', '15:00', 'Primera Salida', '{B02,B01}', 30, false, true, 1),
('S2', '10:00', '17:00', 'Segunda Salida', '{B03}', 30, false, true, 2),
('S3', '11:30', '17:30', 'Tercera Salida', '{B05}', 25, true, true, 3),
('S4', '13:00', '18:00', 'Cuarta Salida', '{B01}', 12, true, true, 4)
ON CONFLICT (id) DO NOTHING;
