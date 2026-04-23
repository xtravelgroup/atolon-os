-- Link bidireccional entre grupos_despedidas y eventos + hora de salida
ALTER TABLE grupos_despedidas ADD COLUMN IF NOT EXISTS evento_id text REFERENCES eventos(id) ON DELETE SET NULL;
ALTER TABLE grupos_despedidas ADD COLUMN IF NOT EXISTS hora_salida text;
CREATE INDEX IF NOT EXISTS idx_grupos_despedidas_evento ON grupos_despedidas(evento_id);
