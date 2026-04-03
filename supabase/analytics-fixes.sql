-- AtolanTrack: Schema fixes from audit

-- Prevent duplicate funnels per session
ALTER TABLE track_embudos DROP CONSTRAINT IF EXISTS track_embudos_sesion_id_unique;
ALTER TABLE track_embudos ADD CONSTRAINT track_embudos_sesion_id_unique UNIQUE (sesion_id);

-- Prevent duplicate users per email
ALTER TABLE track_usuarios DROP CONSTRAINT IF EXISTS track_usuarios_email_hash_unique;
ALTER TABLE track_usuarios ADD CONSTRAINT track_usuarios_email_hash_unique UNIQUE (email_hash);

-- Prevent duplicate revenue per reservation
ALTER TABLE track_ingresos DROP CONSTRAINT IF EXISTS track_ingresos_reserva_id_unique;
ALTER TABLE track_ingresos ADD CONSTRAINT track_ingresos_reserva_id_unique UNIQUE (reserva_id);

-- Performance indexes for date-based queries
CREATE INDEX IF NOT EXISTS idx_track_sesiones_created_at ON track_sesiones(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_track_eventos_ts ON track_eventos(ts DESC);
CREATE INDEX IF NOT EXISTS idx_track_embudos_created_at ON track_embudos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_track_ingresos_created_at ON track_ingresos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_track_atribuciones_created_at ON track_atribuciones(created_at DESC);

-- Add UPDATE policy for track_atribuciones (was missing)
DROP POLICY IF EXISTS "track_atribuciones_update" ON track_atribuciones;
CREATE POLICY "track_atribuciones_update" ON track_atribuciones
  FOR UPDATE TO authenticated USING (true);
