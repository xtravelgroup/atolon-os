-- reservas_lancha — Cupos de lancha para hoteles / B2B
-- Permite reservar IDA / VUELTA / IDA+VUELTA independientemente del pasadía

CREATE TABLE IF NOT EXISTS reservas_lancha (
  id            text PRIMARY KEY,
  fecha         date NOT NULL,
  aliado_id     text REFERENCES aliados_b2b(id) ON DELETE SET NULL,
  nombre        text NOT NULL,           -- nombre del huésped
  contacto      text,                    -- teléfono / email
  pax_a         integer NOT NULL DEFAULT 1,
  pax_n         integer NOT NULL DEFAULT 0,
  direccion     text NOT NULL DEFAULT 'ida_vuelta'
                  CHECK (direccion IN ('ida','vuelta','ida_vuelta')),
  salida_ida_id    text REFERENCES salidas(id) ON DELETE SET NULL,
  salida_vuelta_id text REFERENCES salidas(id) ON DELETE SET NULL,
  estado        text NOT NULL DEFAULT 'confirmado'
                  CHECK (estado IN ('confirmado','cancelado','completado')),
  notas         text,
  creado_por    text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rl_fecha     ON reservas_lancha(fecha);
CREATE INDEX IF NOT EXISTS idx_rl_aliado    ON reservas_lancha(aliado_id);
CREATE INDEX IF NOT EXISTS idx_rl_salida_i  ON reservas_lancha(salida_ida_id);
CREATE INDEX IF NOT EXISTS idx_rl_salida_v  ON reservas_lancha(salida_vuelta_id);

-- RLS: misma política que reservas — acceso autenticado total
ALTER TABLE reservas_lancha ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados full" ON reservas_lancha
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Trigger updated_at
CREATE TRIGGER set_updated_at_rl
  BEFORE UPDATE ON reservas_lancha
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
