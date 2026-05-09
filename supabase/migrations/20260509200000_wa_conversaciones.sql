-- ── Conversaciones de WhatsApp con clientes ─────────────────────────────────
-- Una fila por número de teléfono que ha conversado con Atolón.
-- ai_enabled = true por default (IA responde). Si admin toma control, se
-- pone false hasta que decida volver a activar.

CREATE TABLE IF NOT EXISTS wa_conversaciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefono        text NOT NULL UNIQUE,        -- E.164 normalizado +57XXX...
  wa_id           text,                        -- WhatsApp ID (sin +)
  nombre          text,                        -- nombre del contacto si lo conocemos
  customer_id     text,                        -- FK opcional a leads/clientes
  reserva_id      text,                        -- última reserva asociada (FK suelta)
  last_message_at timestamptz DEFAULT now(),
  last_direction  text,                        -- "in" | "out"
  unread_count    integer DEFAULT 0,
  ai_enabled      boolean DEFAULT true,        -- IA responde automáticamente
  ai_paused_until timestamptz,                 -- IA pausada hasta esta fecha (después se reactiva)
  taken_over_by   text,                        -- email de admin que tomó control
  taken_over_at   timestamptz,
  tags            text[] DEFAULT '{}',
  notas           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_conv_last  ON wa_conversaciones(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_conv_phone ON wa_conversaciones(telefono);
CREATE INDEX IF NOT EXISTS idx_wa_conv_ai    ON wa_conversaciones(ai_enabled) WHERE ai_enabled;

ALTER TABLE wa_conversaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service all wa_conversaciones" ON wa_conversaciones;
CREATE POLICY "service all wa_conversaciones" ON wa_conversaciones FOR ALL TO service_role USING (true);
DROP POLICY IF EXISTS "auth read wa_conversaciones" ON wa_conversaciones;
CREATE POLICY "auth read wa_conversaciones" ON wa_conversaciones FOR SELECT USING (true);
DROP POLICY IF EXISTS "auth update wa_conversaciones" ON wa_conversaciones;
CREATE POLICY "auth update wa_conversaciones" ON wa_conversaciones FOR UPDATE USING (true);

-- ── Mensajes individuales (in / out) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS wa_mensajes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id uuid NOT NULL REFERENCES wa_conversaciones(id) ON DELETE CASCADE,
  wa_message_id   text,                        -- wamid.xxx de Meta (única globalmente)
  direction       text NOT NULL CHECK (direction IN ('in', 'out')),
  type            text NOT NULL,               -- text | template | image | audio | document | etc.
  content         text,                        -- texto plano del mensaje
  template_name   text,                        -- si es template enviada
  media_url       text,                        -- URL del media si aplica
  raw             jsonb,                       -- payload completo de Meta
  sender          text,                        -- "ai" | "system" | "customer" | email del admin
  status          text,                        -- sent | delivered | read | failed
  error           text,                        -- mensaje de error si falló
  sent_at         timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_msg_conv  ON wa_mensajes(conversacion_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_msg_waid  ON wa_mensajes(wa_message_id) WHERE wa_message_id IS NOT NULL;

ALTER TABLE wa_mensajes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service all wa_mensajes" ON wa_mensajes;
CREATE POLICY "service all wa_mensajes" ON wa_mensajes FOR ALL TO service_role USING (true);
DROP POLICY IF EXISTS "auth read wa_mensajes" ON wa_mensajes;
CREATE POLICY "auth read wa_mensajes" ON wa_mensajes FOR SELECT USING (true);

-- ── Trigger: actualizar last_message_at + unread_count en conversación ────
CREATE OR REPLACE FUNCTION wa_update_conv_on_message() RETURNS trigger AS $$
BEGIN
  UPDATE wa_conversaciones SET
    last_message_at = NEW.sent_at,
    last_direction = NEW.direction,
    unread_count = CASE WHEN NEW.direction = 'in' THEN unread_count + 1 ELSE unread_count END,
    updated_at = now()
  WHERE id = NEW.conversacion_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wa_update_conv ON wa_mensajes;
CREATE TRIGGER trg_wa_update_conv
  AFTER INSERT ON wa_mensajes
  FOR EACH ROW EXECUTE FUNCTION wa_update_conv_on_message();
