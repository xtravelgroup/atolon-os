-- Tracking de descuentos por cortesía (dinero NO recibido, solo registrado como descuento 100%)
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS descuento_cortesia numeric DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_reservas_cortesia ON reservas(descuento_cortesia) WHERE descuento_cortesia > 0;
