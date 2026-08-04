-- Anti-chargeback: capturar autorización del cliente antes de redirigir al PSP
-- Registra IP, user-agent, timestamp y versión de términos aceptada.
-- Se usa como evidencia en disputas de tarjeta.
ALTER TABLE reservas
  ADD COLUMN IF NOT EXISTS autorizacion_at timestamptz,
  ADD COLUMN IF NOT EXISTS autorizacion_ip text,
  ADD COLUMN IF NOT EXISTS autorizacion_user_agent text,
  ADD COLUMN IF NOT EXISTS autorizacion_terminos_version text,
  ADD COLUMN IF NOT EXISTS autorizacion_referer text,
  ADD COLUMN IF NOT EXISTS autorizacion_geo jsonb,
  ADD COLUMN IF NOT EXISTS autorizacion_locale text,
  ADD COLUMN IF NOT EXISTS autorizacion_timezone text,
  ADD COLUMN IF NOT EXISTS autorizacion_id_url text,
  ADD COLUMN IF NOT EXISTS autorizacion_id_numero text,
  ADD COLUMN IF NOT EXISTS autorizacion_id_tipo text;

CREATE INDEX IF NOT EXISTS ix_reservas_autorizacion_at
  ON reservas(autorizacion_at) WHERE autorizacion_at IS NOT NULL;
