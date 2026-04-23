ALTER TABLE briefings ADD COLUMN IF NOT EXISTS transcripcion text;
ALTER TABLE briefings ADD COLUMN IF NOT EXISTS ai_resumen text;
ALTER TABLE briefings ADD COLUMN IF NOT EXISTS ai_data jsonb;
