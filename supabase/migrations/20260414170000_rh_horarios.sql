-- ─── RH · Horarios: plantillas de turno + asignaciones por día ──────────────
-- Plantillas de turno reutilizables
CREATE TABLE IF NOT EXISTS rh_turno_plantillas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        text NOT NULL,
  codigo        text,                -- abreviatura (M, T, N, P, D, V)
  hora_ini      time,
  hora_fin      time,
  color         text DEFAULT '#8ECAE6',
  tipo          text DEFAULT 'turno', -- turno | descanso | vacacion | ausencia
  notas         text DEFAULT '',
  activo        boolean DEFAULT true,
  orden         int DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE rh_turno_plantillas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rh_turno_plantillas_all" ON rh_turno_plantillas;
CREATE POLICY "rh_turno_plantillas_all" ON rh_turno_plantillas FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON rh_turno_plantillas TO anon, authenticated;

-- Asignaciones diarias (1 fila por empleado por fecha)
CREATE TABLE IF NOT EXISTS rh_horarios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id   uuid NOT NULL REFERENCES rh_empleados(id) ON DELETE CASCADE,
  fecha         date NOT NULL,
  plantilla_id  uuid REFERENCES rh_turno_plantillas(id) ON DELETE SET NULL,
  hora_ini      time,                -- override de la plantilla
  hora_fin      time,
  tipo          text DEFAULT 'turno', -- turno | descanso | vacacion | ausencia
  notas         text DEFAULT '',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (empleado_id, fecha)
);
CREATE INDEX IF NOT EXISTS idx_rh_horarios_fecha ON rh_horarios(fecha);
CREATE INDEX IF NOT EXISTS idx_rh_horarios_empleado ON rh_horarios(empleado_id);
ALTER TABLE rh_horarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rh_horarios_all" ON rh_horarios;
CREATE POLICY "rh_horarios_all" ON rh_horarios FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON rh_horarios TO anon, authenticated;

-- Plantillas default
INSERT INTO rh_turno_plantillas (nombre, codigo, hora_ini, hora_fin, color, tipo, orden) VALUES
  ('Mañana',   'M', '06:00', '14:00', '#F5C842', 'turno', 1),
  ('Tarde',    'T', '14:00', '22:00', '#F59E0B', 'turno', 2),
  ('Noche',    'N', '22:00', '06:00', '#8b5cf6', 'turno', 3),
  ('Partido',  'P', '08:00', '20:00', '#8ECAE6', 'turno', 4),
  ('Descanso', 'D', NULL,    NULL,    '#64748b', 'descanso', 5),
  ('Vacación', 'V', NULL,    NULL,    '#22c55e', 'vacacion', 6),
  ('Ausencia', 'A', NULL,    NULL,    '#ef4444', 'ausencia', 7)
ON CONFLICT DO NOTHING;
