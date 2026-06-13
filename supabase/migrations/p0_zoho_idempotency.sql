-- Fase 0 · Idempotencia de Zoho webhook
-- =====================================================================

ALTER TABLE public.pagos_zoho_log
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_zoho_log_pid_processed
  ON public.pagos_zoho_log (payment_id, processed_at)
  WHERE processed_at IS NOT NULL;

COMMENT ON COLUMN public.pagos_zoho_log.processed_at IS
  'Timestamp del primer procesamiento exitoso. Handler skip eventos siguientes con mismo payment_id.';
