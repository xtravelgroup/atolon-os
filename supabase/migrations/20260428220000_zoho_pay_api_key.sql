-- Zoho Pay: agregar columnas para API Key y refresh_token
-- API Key es el método preferido (más simple, no requiere OAuth flow)
-- refresh_token es alternativa para OAuth con scope ZohoPay.payments.CREATE

ALTER TABLE configuracion
  ADD COLUMN IF NOT EXISTS zoho_pay_api_key       text,
  ADD COLUMN IF NOT EXISTS zoho_pay_refresh_token text;

COMMENT ON COLUMN configuracion.zoho_pay_api_key IS
  'Zoho Payments API Key (preferido). Genera en https://payments.zoho.com → Settings → API Keys';

COMMENT ON COLUMN configuracion.zoho_pay_refresh_token IS
  'OAuth refresh_token con scope ZohoPay.payments.CREATE,ZohoPay.account.READ. Solo necesario si NO se usa api_key.';
