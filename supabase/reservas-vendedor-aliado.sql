-- Add vendedor, aliado_id fields to reservas
-- Add cupo_credito (credit line) to aliados_b2b
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS vendedor text;
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS aliado_id text;
ALTER TABLE aliados_b2b ADD COLUMN IF NOT EXISTS cupo_credito bigint DEFAULT 0;
