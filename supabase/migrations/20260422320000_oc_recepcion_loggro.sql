-- Columnas para recepción y registro en Loggro desde ordenes_compra
ALTER TABLE public.ordenes_compra
  ADD COLUMN IF NOT EXISTS recibidos          jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS notas_recibo       text,
  ADD COLUMN IF NOT EXISTS factura_numero     text,
  ADD COLUMN IF NOT EXISTS factura_fecha      date,
  ADD COLUMN IF NOT EXISTS fecha_recepcion    timestamptz,
  ADD COLUMN IF NOT EXISTS recibida_por       text,
  ADD COLUMN IF NOT EXISTS loggro_movement_id text;
