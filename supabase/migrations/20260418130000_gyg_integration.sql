-- GetYourGuide (GYG) Partner API integration — Fase 1
-- Mapea pasadías ↔ productos GYG, trackea holds temporales y logs de API.

-- ─── 1. Mapeo producto GYG ↔ pasadía interna ───────────────────────────────
CREATE TABLE IF NOT EXISTS gyg_productos (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gyg_product_id       text UNIQUE NOT NULL,          -- ID que usa GYG
  pasadia_id           text NOT NULL,                 -- FK lógica → pasadias.id
  nombre               text NOT NULL,
  descripcion          text,
  activo               boolean DEFAULT true,
  cutoff_seconds       integer DEFAULT 3600,          -- tiempo mínimo antes de la salida para reservar (1h default)
  reservation_ttl_secs integer DEFAULT 1800,          -- hold de 30 min por default
  categoria_adulto_id  text DEFAULT 'ADULT',          -- ID de categoría precio que expondremos
  categoria_nino_id    text DEFAULT 'CHILD',
  edad_nino_max        integer DEFAULT 11,
  moneda               text DEFAULT 'COP',
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gyg_productos_pasadia ON gyg_productos(pasadia_id);

-- ─── 2. Holds temporales (reservas antes de que GYG confirme el pago) ──────
CREATE TABLE IF NOT EXISTS gyg_holds (
  id                text PRIMARY KEY,                 -- reservation_reference devuelto a GYG
  gyg_product_id    text NOT NULL,
  pasadia_id        text NOT NULL,
  fecha             date NOT NULL,
  salida_id         text,                             -- salida interna a la que corresponde
  pax_adultos       integer NOT NULL DEFAULT 0,
  pax_ninos         integer NOT NULL DEFAULT 0,
  pax_total         integer NOT NULL DEFAULT 0,
  precio_total      numeric NOT NULL DEFAULT 0,
  moneda            text DEFAULT 'COP',
  estado            text NOT NULL DEFAULT 'pending'
                    CHECK (estado IN ('pending','booked','cancelled','expired')),
  expira_at         timestamptz NOT NULL,
  reserva_id        text,                             -- si se convirtió en reserva confirmada → FK a reservas.id
  gyg_payload       jsonb,                            -- request original de GYG (para auditoría)
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gyg_holds_fecha ON gyg_holds(fecha);
CREATE INDEX IF NOT EXISTS idx_gyg_holds_estado ON gyg_holds(estado);
CREATE INDEX IF NOT EXISTS idx_gyg_holds_expira ON gyg_holds(expira_at) WHERE estado = 'pending';

-- ─── 3. Log de llamadas a nuestra API (audit/debug) ────────────────────────
CREATE TABLE IF NOT EXISTS gyg_api_log (
  id            bigserial PRIMARY KEY,
  ts            timestamptz DEFAULT now(),
  endpoint      text NOT NULL,         -- 'get-availabilities', 'reserve', 'book', etc.
  metodo        text,                  -- 'GET', 'POST'
  status_code   integer,
  request_body  jsonb,
  request_query jsonb,
  response_body jsonb,
  error_msg     text,
  duration_ms   integer,
  client_ip     text
);
CREATE INDEX IF NOT EXISTS idx_gyg_log_ts ON gyg_api_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_gyg_log_endpoint ON gyg_api_log(endpoint);

-- ─── 4. Reservas: agregar trazabilidad del origen ──────────────────────────
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS source text DEFAULT 'web';
-- valores esperados: 'web', 'agencia', 'gyg', 'viator', 'walkin', 'b2b', 'hotel'
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS gyg_booking_reference text;
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS gyg_reservation_reference text;
CREATE INDEX IF NOT EXISTS idx_reservas_source ON reservas(source);
CREATE INDEX IF NOT EXISTS idx_reservas_gyg_booking ON reservas(gyg_booking_reference) WHERE gyg_booking_reference IS NOT NULL;

-- ─── 5. RLS: servicio interno solamente (las edge functions usan service role) ──
ALTER TABLE gyg_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE gyg_holds     ENABLE ROW LEVEL SECURITY;
ALTER TABLE gyg_api_log   ENABLE ROW LEVEL SECURITY;

-- Permitir lectura a usuarios autenticados (admins ven los holds y logs en UI interna)
DROP POLICY IF EXISTS "gyg_prod_auth_all" ON gyg_productos;
CREATE POLICY "gyg_prod_auth_all" ON gyg_productos FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "gyg_holds_auth_all" ON gyg_holds;
CREATE POLICY "gyg_holds_auth_all" ON gyg_holds FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "gyg_log_auth_read" ON gyg_api_log;
CREATE POLICY "gyg_log_auth_read" ON gyg_api_log FOR SELECT TO authenticated USING (true);
