-- Zoho Pay — pasarela internacional adicional
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS zoho_pay_client_id text;
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS zoho_pay_client_secret text;
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS zoho_pay_account_id text;
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS zoho_pay_currency text DEFAULT 'USD';
