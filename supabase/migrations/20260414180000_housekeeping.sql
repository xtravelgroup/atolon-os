-- ─── HOUSEKEEPING ────────────────────────────────────────────────────────────

-- Estado de housekeeping en cada habitación (separado del estado operativo "activa/inactiva")
ALTER TABLE hotel_habitaciones ADD COLUMN IF NOT EXISTS estado_hk text DEFAULT 'limpia';
-- estado_hk: limpia | sucia | en_limpieza | inspeccionada | fuera_servicio
ALTER TABLE hotel_habitaciones ADD COLUMN IF NOT EXISTS hk_ultima_limpieza timestamptz;
ALTER TABLE hotel_habitaciones ADD COLUMN IF NOT EXISTS hk_camarera_id uuid;

-- Asignaciones diarias de camareras a habitaciones
CREATE TABLE IF NOT EXISTS hk_asignaciones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha          date NOT NULL,
  habitacion_id  uuid NOT NULL REFERENCES hotel_habitaciones(id) ON DELETE CASCADE,
  camarera_id    uuid REFERENCES rh_empleados(id) ON DELETE SET NULL,
  tipo_servicio  text DEFAULT 'limpieza',  -- limpieza | turndown | check_out | inspeccion
  estado         text DEFAULT 'pendiente',  -- pendiente | en_progreso | completada | omitida
  inicio_at      timestamptz,
  fin_at         timestamptz,
  notas          text DEFAULT '',
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (fecha, habitacion_id, tipo_servicio)
);
CREATE INDEX IF NOT EXISTS idx_hk_asig_fecha ON hk_asignaciones(fecha);
CREATE INDEX IF NOT EXISTS idx_hk_asig_camarera ON hk_asignaciones(camarera_id);
CREATE INDEX IF NOT EXISTS idx_hk_asig_hab ON hk_asignaciones(habitacion_id);

ALTER TABLE hk_asignaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hk_asig_all" ON hk_asignaciones;
CREATE POLICY "hk_asig_all" ON hk_asignaciones FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON hk_asignaciones TO anon, authenticated;

-- Novedades reportadas por camareras (daños, objetos olvidados, mantenimiento)
CREATE TABLE IF NOT EXISTS hk_novedades (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  habitacion_id  uuid REFERENCES hotel_habitaciones(id) ON DELETE SET NULL,
  habitacion_num text,
  asignacion_id  uuid REFERENCES hk_asignaciones(id) ON DELETE SET NULL,
  camarera_id    uuid REFERENCES rh_empleados(id) ON DELETE SET NULL,
  reportada_por  text DEFAULT '',
  tipo           text NOT NULL,  -- dano | olvidado | mantenimiento | amenidad_faltante | otro
  prioridad      text DEFAULT 'normal',  -- baja | normal | alta | critica
  descripcion    text NOT NULL,
  foto_url       text,
  estado         text DEFAULT 'abierta',  -- abierta | en_proceso | resuelta | descartada
  resuelta_at    timestamptz,
  resuelta_por   text,
  resolucion     text,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hk_nov_habitacion ON hk_novedades(habitacion_id);
CREATE INDEX IF NOT EXISTS idx_hk_nov_estado ON hk_novedades(estado);
CREATE INDEX IF NOT EXISTS idx_hk_nov_created ON hk_novedades(created_at DESC);

ALTER TABLE hk_novedades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hk_nov_all" ON hk_novedades;
CREATE POLICY "hk_nov_all" ON hk_novedades FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON hk_novedades TO anon, authenticated;

-- Tokens de acceso del portal móvil de camareras (sin login)
CREATE TABLE IF NOT EXISTS hk_camarera_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token        text UNIQUE NOT NULL,
  camarera_id  uuid NOT NULL REFERENCES rh_empleados(id) ON DELETE CASCADE,
  expira_at    timestamptz NOT NULL,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hk_tokens_token ON hk_camarera_tokens(token);

ALTER TABLE hk_camarera_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hk_tokens_all" ON hk_camarera_tokens;
CREATE POLICY "hk_tokens_all" ON hk_camarera_tokens FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON hk_camarera_tokens TO anon, authenticated;
