-- ── Sistema Tatiana: reservas de pasadía vía Visito.AI / chat web ────────
-- Tabla SEPARADA de `reservas` (que es para flujo web actual). Tatiana
-- maneja un flujo distinto: chat → tool call → reserva → link unificado.

CREATE TABLE IF NOT EXISTS reservas_pasadia (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha             DATE NOT NULL,
  horario_salida    TEXT NOT NULL CHECK (horario_salida IN ('08:30', '10:00', '11:30')),
  producto          TEXT NOT NULL CHECK (producto IN ('vip', 'exclusive', 'experience', 'after-island')),
  num_personas      INTEGER NOT NULL CHECK (num_personas > 0),
  num_adultos       INTEGER,
  num_ninos         INTEGER DEFAULT 0,
  estado            TEXT NOT NULL DEFAULT 'pendiente_pago'
                    CHECK (estado IN ('confirmada', 'pendiente_pago', 'cancelada')),
  cliente_nombre    TEXT NOT NULL,
  cliente_telefono  TEXT,
  cliente_email     TEXT,
  idioma            TEXT DEFAULT 'es',
  total_cop         INTEGER NOT NULL,
  link_pago         TEXT,
  link_wompi        TEXT,
  link_zoho         TEXT,
  pasarela_usada    TEXT CHECK (pasarela_usada IN ('Wompi', 'Zoho Pay')),
  moneda_pagada     TEXT CHECK (moneda_pagada IN ('COP', 'USD')),
  pago_referencia   TEXT,
  pagado_en         TIMESTAMPTZ,
  fuente            TEXT DEFAULT 'visito_ai',  -- visito_ai, web, whatsapp
  expira_en         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resp_fecha   ON reservas_pasadia(fecha);
CREATE INDEX IF NOT EXISTS idx_resp_estado  ON reservas_pasadia(estado);
CREATE INDEX IF NOT EXISTS idx_resp_email   ON reservas_pasadia(cliente_email);
CREATE INDEX IF NOT EXISTS idx_resp_horario ON reservas_pasadia(fecha, horario_salida) WHERE estado != 'cancelada';

-- Trigger updated_at
CREATE OR REPLACE FUNCTION resp_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_resp_updated_at ON reservas_pasadia;
CREATE TRIGGER trg_resp_updated_at
  BEFORE UPDATE ON reservas_pasadia
  FOR EACH ROW EXECUTE FUNCTION resp_set_updated_at();

-- RLS
ALTER TABLE reservas_pasadia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service all reservas_pasadia" ON reservas_pasadia;
CREATE POLICY "service all reservas_pasadia" ON reservas_pasadia FOR ALL TO service_role USING (true);
DROP POLICY IF EXISTS "public read reservas_pasadia" ON reservas_pasadia;
CREATE POLICY "public read reservas_pasadia" ON reservas_pasadia FOR SELECT USING (true);
DROP POLICY IF EXISTS "auth update reservas_pasadia" ON reservas_pasadia;
CREATE POLICY "auth update reservas_pasadia" ON reservas_pasadia FOR UPDATE USING (true);

-- ── Auto-cancelar reservas pendientes expiradas ─────────────────────────
CREATE OR REPLACE FUNCTION cancelar_pendientes_expiradas()
RETURNS void AS $$
BEGIN
  UPDATE reservas_pasadia
  SET estado = 'cancelada', updated_at = now()
  WHERE estado = 'pendiente_pago' AND expira_en < now();
END;
$$ LANGUAGE plpgsql;

-- ── Configuración de Tatiana en `configuracion` (rotable desde UI) ──────
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS tatiana_system_prompt TEXT;
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS tatiana_model TEXT DEFAULT 'claude-sonnet-4-5';
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS tatiana_enabled BOOLEAN DEFAULT true;
