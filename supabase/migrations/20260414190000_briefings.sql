-- ─── BRIEFINGS · Reuniones con supervisores y gerentes ──────────────────────

CREATE TABLE IF NOT EXISTS briefings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo        text UNIQUE,                  -- "BR-2026-0001"
  fecha         date NOT NULL,
  hora          time,
  titulo        text,
  tipo          text DEFAULT 'general',       -- general | semanal | mensual | extraordinario
  asistentes    jsonb DEFAULT '[]'::jsonb,    -- [{ id, nombre, cargo, presente: true }]
  agenda        jsonb DEFAULT '[]'::jsonb,    -- [{ id, titulo, descripcion, orden }]
  notas         text DEFAULT '',
  acuerdos      text DEFAULT '',
  estado        text DEFAULT 'programado',    -- programado | en_curso | cerrado | cancelado
  briefing_anterior_id uuid REFERENCES briefings(id) ON DELETE SET NULL,
  creado_por    text DEFAULT '',
  cerrado_at    timestamptz,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_briefings_fecha ON briefings(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_briefings_estado ON briefings(estado);

ALTER TABLE briefings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "briefings_all" ON briefings;
CREATE POLICY "briefings_all" ON briefings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON briefings TO anon, authenticated;

CREATE TABLE IF NOT EXISTS briefing_tareas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_id     uuid REFERENCES briefings(id) ON DELETE CASCADE,
  titulo          text NOT NULL,
  descripcion     text DEFAULT '',
  asignado_id     uuid REFERENCES rh_empleados(id) ON DELETE SET NULL,
  asignado_nombre text DEFAULT '',
  fecha_limite    date,
  prioridad       text DEFAULT 'normal',     -- baja | normal | alta | critica
  estado          text DEFAULT 'pendiente',  -- pendiente | en_progreso | completada | cancelada
  notas_seguimiento text DEFAULT '',
  completada_at   timestamptz,
  completada_por  text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_brief_tareas_brief ON briefing_tareas(briefing_id);
CREATE INDEX IF NOT EXISTS idx_brief_tareas_asignado ON briefing_tareas(asignado_id);
CREATE INDEX IF NOT EXISTS idx_brief_tareas_estado ON briefing_tareas(estado);
CREATE INDEX IF NOT EXISTS idx_brief_tareas_limite ON briefing_tareas(fecha_limite);

ALTER TABLE briefing_tareas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "brief_tareas_all" ON briefing_tareas;
CREATE POLICY "brief_tareas_all" ON briefing_tareas FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON briefing_tareas TO anon, authenticated;
