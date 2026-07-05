-- Timeout de reservas sin pagar — dirección 2026-07-05.
-- Al crear una reserva de grupo, se setea expira_en = now() + 30 min.
-- Un cron cancela automáticamente las que no fueron pagadas.
-- Al confirmar pago, se limpia expira_en para evitar race.

ALTER TABLE public.hotel_estancias
  ADD COLUMN IF NOT EXISTS expira_en timestamptz;

-- Índice parcial: solo las que aún pueden expirar (unpaid + con timeout).
CREATE INDEX IF NOT EXISTS idx_hotel_estancias_expira
  ON public.hotel_estancias(expira_en)
  WHERE expira_en IS NOT NULL AND pagado_en IS NULL;
