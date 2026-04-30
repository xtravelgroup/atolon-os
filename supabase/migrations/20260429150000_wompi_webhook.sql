-- Wompi webhook: tabla de log + columna de referencia de pago.
-- Antes solo confirmábamos pagos vía redirect post-checkout, lo que dejaba
-- reservas colgadas si el cliente cerraba el navegador antes del redirect.
-- Caso típico: WEB-1777480823458 (Juliana Claros, $1.92M) — Wompi aprobó
-- el pago el 29-abr 11:41 AM pero la reserva quedó pendiente.

-- ── 1) Log de eventos recibidos ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wompi_eventos_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento          text,
  referencia      text,
  transaction_id  text,
  status          text,
  monto           numeric(14,2),
  raw             jsonb,
  firma_valida    boolean DEFAULT false,
  created_at      timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wompi_log_ref ON wompi_eventos_log(referencia);
CREATE INDEX IF NOT EXISTS idx_wompi_log_tx  ON wompi_eventos_log(transaction_id);
CREATE INDEX IF NOT EXISTS idx_wompi_log_at  ON wompi_eventos_log(created_at DESC);

ALTER TABLE wompi_eventos_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wompi_log_read_auth ON wompi_eventos_log;
CREATE POLICY wompi_log_read_auth ON wompi_eventos_log
  FOR SELECT TO authenticated USING (true);

-- ── 2) Columna referencia_pago en reservas (para guardar tx_id) ─────────
ALTER TABLE reservas
  ADD COLUMN IF NOT EXISTS referencia_pago text;

COMMENT ON COLUMN reservas.referencia_pago IS
  'ID de la transacción en el procesador (Wompi, Stripe, Zoho). Útil para conciliar y auditoría.';
