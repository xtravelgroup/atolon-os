-- Foto de odómetro y horas por motor en llegadas (opcional, solo Natturale/Castillete)
ALTER TABLE muelle_llegadas
  ADD COLUMN IF NOT EXISTS odometro_foto_url text,
  ADD COLUMN IF NOT EXISTS motores_horas jsonb;

-- Índice opcional por si se quiere reportar por motor
CREATE INDEX IF NOT EXISTS idx_muelle_llegadas_motores_horas
  ON muelle_llegadas USING gin(motores_horas);
