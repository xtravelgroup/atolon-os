-- Descuento general aplicable a una reserva por gerencia/dirección.
-- Reduce el total de la reserva (no se contabiliza como abono ni cortesía).
ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS descuento_general numeric DEFAULT 0;
