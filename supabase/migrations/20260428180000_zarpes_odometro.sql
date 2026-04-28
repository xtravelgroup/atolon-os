-- Foto odómetro y horas por motor en zarpes (igual que en llegadas)
ALTER TABLE muelle_zarpes_flota
  ADD COLUMN IF NOT EXISTS odometro_foto_url text,
  ADD COLUMN IF NOT EXISTS motores_horas jsonb;

CREATE INDEX IF NOT EXISTS idx_zarpes_motores_horas
  ON muelle_zarpes_flota USING gin(motores_horas);
