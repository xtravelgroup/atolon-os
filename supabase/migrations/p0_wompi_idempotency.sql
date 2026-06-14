-- Fase 0 · Idempotencia de Wompi webhook
-- =====================================================================
-- Agrega processed_at a wompi_eventos_log para que el handler pueda
-- detectar retries y devolver 200 sin reprocesar (evita duplicar
-- emails/WhatsApp/track_ingresos y reescribir abono).
-- =====================================================================

ALTER TABLE public.wompi_eventos_log
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_wompi_log_tx_processed
  ON public.wompi_eventos_log (transaction_id, processed_at)
  WHERE processed_at IS NOT NULL;

COMMENT ON COLUMN public.wompi_eventos_log.processed_at IS
  'Timestamp del primer procesamiento exitoso. NULL = aun no procesado. Si NOT NULL, el handler skip eventos siguientes con mismo transaction_id.';
