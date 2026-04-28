-- Reserva mensual para reposición eventual de motores
-- (Ej: Yamaha F350 ~$180M cada uno × 2 motores Naturalle / 3000h vida útil)
ALTER TABLE lanchas
  ADD COLUMN IF NOT EXISTS motor_reserva_mensual numeric(14,2) DEFAULT 0;

COMMENT ON COLUMN lanchas.motor_reserva_mensual IS
  'Reserva contable mensual para reposición de motores. Se suma al costo operativo del mes para amortizar la futura compra de motores nuevos.';
