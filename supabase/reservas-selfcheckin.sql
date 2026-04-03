-- Campos para self check-in del cliente
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS alergias text;
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS extras_solicitados jsonb DEFAULT '[]'::jsonb;
