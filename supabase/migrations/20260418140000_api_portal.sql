-- ═══════════════════════════════════════════════════════════════════════════
-- API Portal — self-service partner API (OTAs, agencies, integrators)
-- Admin-only RLS (authenticated). Edge function uses service role to bypass.
-- NOTE: tabla api_keys ya existe (20260418000000) con otra estructura (por
--   aliados_b2b), por eso aquí usamos api_partner_keys para no colisionar.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Partners ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_partners (
  id         text PRIMARY KEY,
  nombre     text NOT NULL,
  email      text,
  empresa    text,
  tipo       text NOT NULL DEFAULT 'Integrador'
             CHECK (tipo IN ('OTA','Agencia','Integrador','Revendedor')),
  estado     text NOT NULL DEFAULT 'pendiente'
             CHECK (estado IN ('pendiente','activo','suspendido')),
  notas      text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_partners_estado ON api_partners(estado);
CREATE INDEX IF NOT EXISTS idx_api_partners_tipo   ON api_partners(tipo);

-- ─── 2. API keys (hashed) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_partner_keys (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id          text NOT NULL REFERENCES api_partners(id) ON DELETE CASCADE,
  key_hash            text NOT NULL UNIQUE,                         -- sha256 hex
  key_prefix          text NOT NULL,                                -- primeros 12 chars para identificar
  nombre              text,                                          -- label opcional (ej. "Producción")
  scopes              text[] DEFAULT ARRAY['read:pasadias','read:availability','write:reservas']::text[],
  estado              text NOT NULL DEFAULT 'activa'
                      CHECK (estado IN ('activa','revocada')),
  rate_limit_per_min  integer NOT NULL DEFAULT 60,
  last_used_at        timestamptz,
  expires_at          timestamptz,
  created_at          timestamptz DEFAULT now(),
  revoked_at          timestamptz
);
CREATE INDEX IF NOT EXISTS idx_api_pkeys_partner ON api_partner_keys(partner_id);
CREATE INDEX IF NOT EXISTS idx_api_pkeys_hash    ON api_partner_keys(key_hash) WHERE estado = 'activa';

-- ─── 3. Request log ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_partner_logs (
  id            bigserial PRIMARY KEY,
  ts            timestamptz DEFAULT now(),
  partner_id    text,
  key_id        uuid,
  endpoint      text,
  metodo        text,
  status_code   integer,
  duration_ms   integer,
  request_query jsonb,
  request_body  jsonb,
  response_body jsonb,
  client_ip     text,
  error_msg     text
);
CREATE INDEX IF NOT EXISTS idx_api_plogs_ts       ON api_partner_logs(ts DESC);
CREATE INDEX IF NOT EXISTS idx_api_plogs_partner  ON api_partner_logs(partner_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_api_plogs_key      ON api_partner_logs(key_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_api_plogs_endpoint ON api_partner_logs(endpoint);

-- ─── 4. Webhooks ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_partner_webhooks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id  text NOT NULL REFERENCES api_partners(id) ON DELETE CASCADE,
  event_type  text NOT NULL
              CHECK (event_type IN ('reserva.created','reserva.cancelled','disponibilidad.updated')),
  url         text NOT NULL,
  secret      text NOT NULL,            -- compartido con partner para HMAC-SHA256
  activo      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_webhooks_partner ON api_partner_webhooks(partner_id);
CREATE INDEX IF NOT EXISTS idx_api_webhooks_event   ON api_partner_webhooks(event_type) WHERE activo = true;

-- ─── 5. RLS — admin (authenticated) only ───────────────────────────────────
ALTER TABLE api_partners          ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_partner_keys      ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_partner_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_partner_webhooks  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "api_partners_auth_all"    ON api_partners;
CREATE POLICY "api_partners_auth_all"    ON api_partners          FOR ALL    TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "api_pkeys_auth_all"       ON api_partner_keys;
CREATE POLICY "api_pkeys_auth_all"       ON api_partner_keys      FOR ALL    TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "api_plogs_auth_read"      ON api_partner_logs;
CREATE POLICY "api_plogs_auth_read"      ON api_partner_logs      FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "api_webhooks_auth_all"    ON api_partner_webhooks;
CREATE POLICY "api_webhooks_auth_all"    ON api_partner_webhooks  FOR ALL    TO authenticated USING (true) WITH CHECK (true);
