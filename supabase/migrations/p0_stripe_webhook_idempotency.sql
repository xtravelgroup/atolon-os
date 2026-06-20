-- Fase 0 · Idempotencia de Stripe webhook
-- =====================================================================
-- Tabla para dedupe por event.id. El webhook hace INSERT con ON CONFLICT
-- (via dialect supabase-js: revisar error.code == '23505'); si la fila
-- ya existe, devuelve 200 sin reprocesar.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id    text PRIMARY KEY,
  event_type  text,
  received_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.stripe_webhook_events TO service_role;

COMMENT ON TABLE public.stripe_webhook_events IS
  'Dedupe de webhooks Stripe por event.id. Append-only.';

-- Columnas de tracking en reservas (idempotente — si ya existen, no falla)
ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS referencia_pago text,
  ADD COLUMN IF NOT EXISTS fecha_pago      date;

CREATE INDEX IF NOT EXISTS idx_reservas_ref_pago
  ON public.reservas (referencia_pago)
  WHERE referencia_pago IS NOT NULL;
