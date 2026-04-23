-- Selector de merchant activo para pagos internacionales
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS merchant_internacional text DEFAULT 'stripe';
-- merchant_internacional: 'stripe' | 'zoho_pay'
