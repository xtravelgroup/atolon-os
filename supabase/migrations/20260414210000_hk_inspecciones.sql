-- Inspecciones de habitaciones (35 puntos)
CREATE TABLE IF NOT EXISTS hk_inspecciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  habitacion_id   uuid REFERENCES hotel_habitaciones(id) ON DELETE SET NULL,
  habitacion_num  text,
  tipo            text,
  inspector       text,
  turno           text,
  hora_inicio     timestamptz DEFAULT now(),
  hora_fin        timestamptz,
  estado_global   text DEFAULT 'en-progreso',  -- en-progreso | aprobada | rechazada
  score           int,
  total_ok        int,
  total_falla     int,
  total_na        int,
  criticos_falla  int,
  estados         jsonb DEFAULT '{}'::jsonb,   -- { "1": "ok", "2": "falla", ... }
  notas           jsonb DEFAULT '{}'::jsonb,   -- { "5": "el grifo gotea", ... }
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hk_insp_habitacion ON hk_inspecciones(habitacion_id);
CREATE INDEX IF NOT EXISTS idx_hk_insp_fecha ON hk_inspecciones(created_at DESC);

ALTER TABLE hk_inspecciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hk_insp_all" ON hk_inspecciones;
CREATE POLICY "hk_insp_all" ON hk_inspecciones FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON hk_inspecciones TO anon, authenticated;
