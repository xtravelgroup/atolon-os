-- Zarpe grupal: columnas en eventos
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS zarpe_data      jsonb DEFAULT '[]';
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS invitados_zarpe jsonb DEFAULT '[]';
