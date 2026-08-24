-- ═══════════════════════════════════════════════════════════════════════
-- NPS post-visita (Fase 2.3 AtolonTrack)
-- ═══════════════════════════════════════════════════════════════════════

-- Marca en reservas cuándo se envió la solicitud NPS (una sola vez)
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS nps_solicitado_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_reservas_nps_pending
  ON reservas(fecha) WHERE nps_solicitado_at IS NULL;

-- Tabla de respuestas NPS
CREATE TABLE IF NOT EXISTS nps_respuestas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reserva_id    text NOT NULL,
  token         text UNIQUE NOT NULL,
    -- token único del link enviado, sirve para autenticar la respuesta
  cliente_nombre text,
  telefono      text,
  email         text,
  canal_origen  text,  -- web | whatsapp | otro
  score         int,   -- 0-10 (NULL si aún no respondió)
  categoria     text,  -- promotor (9-10) · pasivo (7-8) · detractor (0-6)
  comentario    text,
  google_review_click boolean DEFAULT false,
  created_at    timestamptz DEFAULT now(),
  responded_at  timestamptz,
  CONSTRAINT nps_score_range CHECK (score IS NULL OR (score >= 0 AND score <= 10))
);
CREATE INDEX IF NOT EXISTS idx_nps_reserva ON nps_respuestas(reserva_id);
CREATE INDEX IF NOT EXISTS idx_nps_responded ON nps_respuestas(responded_at DESC) WHERE responded_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nps_categoria ON nps_respuestas(categoria);

ALTER TABLE nps_respuestas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nps_auth_read" ON nps_respuestas;
CREATE POLICY "nps_auth_read" ON nps_respuestas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "nps_service_write" ON nps_respuestas;
CREATE POLICY "nps_service_write" ON nps_respuestas FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Público puede insertar solo con token válido (edge fn valida) — RLS restringido
-- para que el UPDATE con score venga vía edge fn, no directo del cliente.

COMMENT ON TABLE nps_respuestas IS 'Respuestas NPS post-visita (Fase 2.3). El token se genera al enviar el WA y valida la respuesta pública.';
