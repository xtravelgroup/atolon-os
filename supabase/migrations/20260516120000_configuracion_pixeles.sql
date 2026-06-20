-- Píxeles / tracking de terceros configurables desde el portal /track.
-- Se inyectan en el sitio público de reservas (booking/pago) para
-- retargeting, carritos abandonados y ventas por campaña.
ALTER TABLE configuracion
  ADD COLUMN IF NOT EXISTS meta_pixel_id   text,
  ADD COLUMN IF NOT EXISTS gtm_id          text,
  ADD COLUMN IF NOT EXISTS ga4_id          text,
  ADD COLUMN IF NOT EXISTS google_ads_id   text,
  ADD COLUMN IF NOT EXISTS tiktok_pixel_id text;
