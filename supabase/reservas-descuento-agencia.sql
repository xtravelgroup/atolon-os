ALTER TABLE reservas ADD COLUMN IF NOT EXISTS descuento_agencia integer DEFAULT 0;

-- Registrar el descuento de Juan Guillermo
UPDATE reservas SET descuento_agencia = 400000 WHERE id = 'R-1775250812568';
