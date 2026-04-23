-- Add nacionalidad and beo_notas columns to eventos
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS nacionalidad text;
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS beo_notas jsonb DEFAULT '{}'::jsonb;
