-- Sesiones de Zoho Payments (tracking de payment links + webhook)
CREATE TABLE IF NOT EXISTS pagos_zoho_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_link_id  text,
  payment_id       text,
  reference        text,
  amount           numeric,
  currency         text DEFAULT 'USD',
  context          text,          -- 'pedido' | 'reserva' | 'evento' | 'estancia'
  context_id       uuid,          -- id del recurso a actualizar
  status           text DEFAULT 'pendiente',  -- pendiente | pagado | fallido | expirado
  last4            text,
  brand            text,
  pagado_at        timestamptz,
  raw              jsonb,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pagos_zoho_link ON pagos_zoho_sessions(payment_link_id);
CREATE INDEX IF NOT EXISTS idx_pagos_zoho_ref ON pagos_zoho_sessions(reference);
CREATE INDEX IF NOT EXISTS idx_pagos_zoho_context ON pagos_zoho_sessions(context, context_id);

ALTER TABLE pagos_zoho_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pagos_zoho_all" ON pagos_zoho_sessions;
CREATE POLICY "pagos_zoho_all" ON pagos_zoho_sessions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON pagos_zoho_sessions TO anon, authenticated;
