-- ─── Horarios: agregar actividades por departamento + columna en rh_horarios ──

CREATE TABLE IF NOT EXISTS rh_actividades (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          text NOT NULL,            -- ej: "Cocina servicio", "Bar playa", "Muelle recepción"
  departamento_id uuid REFERENCES rh_departamentos(id) ON DELETE SET NULL,
  color           text DEFAULT '#8ECAE6',
  icono           text DEFAULT '',          -- emoji opcional
  orden           int DEFAULT 0,
  activo          boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rh_actividades_dept ON rh_actividades(departamento_id);

ALTER TABLE rh_actividades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rh_actividades_all" ON rh_actividades;
CREATE POLICY "rh_actividades_all" ON rh_actividades FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON rh_actividades TO anon, authenticated;

-- Agregar columna a rh_horarios para vincular un turno a una actividad específica
ALTER TABLE rh_horarios ADD COLUMN IF NOT EXISTS actividad_id uuid REFERENCES rh_actividades(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_rh_horarios_actividad ON rh_horarios(actividad_id);

-- Seed de actividades comunes para Atolón (se puede editar desde la UI)
INSERT INTO rh_actividades (nombre, color, icono, orden) VALUES
  ('Cocina',             '#F59E0B', '🍳', 10),
  ('Bar',                '#8b5cf6', '🍹', 20),
  ('Meseros',            '#34D399', '🍽️', 30),
  ('Muelle / Recepción', '#0EA5E9', '⚓', 40),
  ('Flota / Capitanes',  '#0D1B3E', '⛵', 50),
  ('Housekeeping',       '#F4C6D0', '🧹', 60),
  ('Mantenimiento',      '#EF4444', '🔧', 70),
  ('Eventos',            '#C8B99A', '🎉', 80),
  ('Administrativo',     '#94A3B8', '📋', 90)
ON CONFLICT DO NOTHING;
