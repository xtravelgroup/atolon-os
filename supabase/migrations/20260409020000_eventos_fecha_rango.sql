-- Eventos: soporte para eventos multi-día con buy-out selectivo por fecha
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS fecha_fin date;
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS buy_out_fechas jsonb DEFAULT '[]'::jsonb;

-- Backfill: eventos existentes con buy_out=true → buy_out_fechas = [fecha]
UPDATE eventos
SET buy_out_fechas = jsonb_build_array(fecha::text)
WHERE buy_out = true AND (buy_out_fechas IS NULL OR buy_out_fechas = '[]'::jsonb) AND fecha IS NOT NULL;
