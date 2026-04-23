-- Log de todos los eventos recibidos del webhook de Zoho Pay (para debug / auditoría)
CREATE TABLE IF NOT EXISTS pagos_zoho_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type   text,
  reference    text,
  payment_id   text,
  raw          jsonb,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pagos_zoho_log_ref ON pagos_zoho_log(reference);
CREATE INDEX IF NOT EXISTS idx_pagos_zoho_log_created ON pagos_zoho_log(created_at DESC);

ALTER TABLE pagos_zoho_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pagos_zoho_log_all" ON pagos_zoho_log;
CREATE POLICY "pagos_zoho_log_all" ON pagos_zoho_log FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON pagos_zoho_log TO anon, authenticated;
