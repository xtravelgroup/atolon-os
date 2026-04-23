-- ── API Keys para el Portal Público (integraciones B2B en tiempo real) ──────
-- Permite que agencias, hoteles y otros proveedores consuman endpoints REST
-- autenticados con una API key (Bearer token) en vez de JWT de usuario.

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,  -- "atln_live_" + random 32 chars
  aliado_id text REFERENCES aliados_b2b(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  activa boolean DEFAULT true,
  rate_limit_per_min int DEFAULT 60,
  ultimo_uso timestamptz,
  uso_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key) WHERE activa = true;
CREATE INDEX IF NOT EXISTS idx_api_keys_aliado ON api_keys(aliado_id);
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_all" ON api_keys;
CREATE POLICY "admin_all" ON api_keys FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Log de uso para rate limiting y auditoría ───────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys_log (
  id bigserial PRIMARY KEY,
  key_id uuid REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint text,
  method text,
  status int,
  ip text,
  user_agent text,
  at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_log_at ON api_keys_log(at DESC);
CREATE INDEX IF NOT EXISTS idx_api_keys_log_key ON api_keys_log(key_id, at DESC);
ALTER TABLE api_keys_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_read" ON api_keys_log;
CREATE POLICY "admin_read" ON api_keys_log FOR SELECT TO authenticated USING (true);
