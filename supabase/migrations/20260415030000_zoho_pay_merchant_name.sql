ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS zoho_pay_merchant_name text DEFAULT 'X Travel Group';
UPDATE configuracion SET zoho_pay_merchant_name = 'X Travel Group' WHERE zoho_pay_merchant_name IS NULL;
