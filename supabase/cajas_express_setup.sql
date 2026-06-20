-- ═══════════════════════════════════════════════════════════════════
-- Cajas Express — MVP para evento con N cajas vendiendo bebida/comida
-- conectadas a Loggro. Cajeros se identifican con PIN.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Cajeros (PIN-based auth) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS cajas_evento_cajeros (
  id            text PRIMARY KEY,
  nombre        text NOT NULL,
  pin           text NOT NULL CHECK (length(pin) BETWEEN 4 AND 6),
  activo        boolean DEFAULT true,
  loggro_seller_id text,         -- objectId del seller en Loggro (opcional)
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cajas_evento_cajeros_pin_unique
  ON cajas_evento_cajeros (pin) WHERE activo = true;

-- ── 2. Cajas físicas (cada una mapea a una "mesa virtual" en Loggro) ─
CREATE TABLE IF NOT EXISTS cajas_evento_cajas (
  id              text PRIMARY KEY,
  nombre          text NOT NULL,              -- "CAJA 1", "CAJA 2"
  loggro_mesa_id  text,                       -- objectId de la mesa virtual en Loggro
  activo          boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ── 3. Catálogo del evento — qué productos están visibles en cajas ──
-- Reutiliza items_catalogo agregando 2 columnas: visible al evento y
-- precio override (por si el precio del evento difiere del normal).
ALTER TABLE items_catalogo
  ADD COLUMN IF NOT EXISTS evento_caja_visible boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS evento_caja_precio  numeric;

-- ── 4. Ventas de las cajas (log de cada transacción) ──────────────
CREATE TABLE IF NOT EXISTS cajas_evento_ventas (
  id              text PRIMARY KEY,
  caja_id         text REFERENCES cajas_evento_cajas(id),
  cajero_id       text REFERENCES cajas_evento_cajeros(id),
  cajero_nombre   text,           -- snapshot al momento de la venta
  items           jsonb NOT NULL DEFAULT '[]',
  subtotal        numeric NOT NULL DEFAULT 0,
  total           numeric NOT NULL DEFAULT 0,
  metodo_pago     text NOT NULL CHECK (metodo_pago IN ('efectivo','tarjeta')),
  loggro_order_id text,
  loggro_response jsonb,
  loggro_estado   text DEFAULT 'pending',   -- pending | sent | failed
  loggro_error    text,
  notas           text,
  estado          text NOT NULL DEFAULT 'completada' CHECK (estado IN ('completada','anulada')),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cajas_evento_ventas_cajero_idx ON cajas_evento_ventas (cajero_id);
CREATE INDEX IF NOT EXISTS cajas_evento_ventas_caja_idx   ON cajas_evento_ventas (caja_id);
CREATE INDEX IF NOT EXISTS cajas_evento_ventas_created_idx ON cajas_evento_ventas (created_at DESC);

-- ── 5. RLS abierto (uso interno) ──────────────────────────────────
ALTER TABLE cajas_evento_cajeros ENABLE ROW LEVEL SECURITY;
ALTER TABLE cajas_evento_cajas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cajas_evento_ventas  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cajas_cajeros_all_anon ON cajas_evento_cajeros;
DROP POLICY IF EXISTS cajas_cajeros_all_auth ON cajas_evento_cajeros;
CREATE POLICY cajas_cajeros_all_anon ON cajas_evento_cajeros FOR ALL TO anon          USING (true) WITH CHECK (true);
CREATE POLICY cajas_cajeros_all_auth ON cajas_evento_cajeros FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS cajas_cajas_all_anon ON cajas_evento_cajas;
DROP POLICY IF EXISTS cajas_cajas_all_auth ON cajas_evento_cajas;
CREATE POLICY cajas_cajas_all_anon ON cajas_evento_cajas FOR ALL TO anon          USING (true) WITH CHECK (true);
CREATE POLICY cajas_cajas_all_auth ON cajas_evento_cajas FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS cajas_ventas_all_anon ON cajas_evento_ventas;
DROP POLICY IF EXISTS cajas_ventas_all_auth ON cajas_evento_ventas;
CREATE POLICY cajas_ventas_all_anon ON cajas_evento_ventas FOR ALL TO anon          USING (true) WITH CHECK (true);
CREATE POLICY cajas_ventas_all_auth ON cajas_evento_ventas FOR ALL TO authenticated USING (true) WITH CHECK (true);
