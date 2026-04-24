-- ─────────────────────────────────────────────────────────────────────────────
-- Hotel PMS Core — Reservas, Huéspedes extendidos, Tarifas
-- `hotel_estancias` ya existe y cubre reservas + estancias (mismo registro en
-- distintos estados). Aquí extendemos columnas y agregamos hotel_tarifas.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Huéspedes: perfil extendido ───────────────────────────────────────────
ALTER TABLE hotel_huespedes ADD COLUMN IF NOT EXISTS apellido          text;
ALTER TABLE hotel_huespedes ADD COLUMN IF NOT EXISTS documento_tipo    text;  -- CC|PS|CE|TI|NIT
ALTER TABLE hotel_huespedes ADD COLUMN IF NOT EXISTS documento         text;
ALTER TABLE hotel_huespedes ADD COLUMN IF NOT EXISTS fecha_nacimiento  date;
ALTER TABLE hotel_huespedes ADD COLUMN IF NOT EXISTS ciudad            text;
ALTER TABLE hotel_huespedes ADD COLUMN IF NOT EXISTS direccion         text;
ALTER TABLE hotel_huespedes ADD COLUMN IF NOT EXISTS empresa           text;
ALTER TABLE hotel_huespedes ADD COLUMN IF NOT EXISTS vip               boolean DEFAULT false;
ALTER TABLE hotel_huespedes ADD COLUMN IF NOT EXISTS blacklist         boolean DEFAULT false;
ALTER TABLE hotel_huespedes ADD COLUMN IF NOT EXISTS updated_at        timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_huespedes_documento ON hotel_huespedes(documento);
CREATE INDEX IF NOT EXISTS idx_huespedes_email     ON hotel_huespedes(email);
CREATE INDEX IF NOT EXISTS idx_huespedes_vip       ON hotel_huespedes(vip) WHERE vip = true;

-- ── Estancias: columnas adicionales de reserva/tarifa ─────────────────────
ALTER TABLE hotel_estancias ADD COLUMN IF NOT EXISTS tarifa_id             uuid;
ALTER TABLE hotel_estancias ADD COLUMN IF NOT EXISTS precio_noche          numeric DEFAULT 0;
ALTER TABLE hotel_estancias ADD COLUMN IF NOT EXISTS total                 numeric DEFAULT 0;
ALTER TABLE hotel_estancias ADD COLUMN IF NOT EXISTS deposito              numeric DEFAULT 0;
ALTER TABLE hotel_estancias ADD COLUMN IF NOT EXISTS canal                 text DEFAULT 'directo';  -- directo|web|telefono|email|ota|walkin
ALTER TABLE hotel_estancias ADD COLUMN IF NOT EXISTS solicitudes_especiales text;
ALTER TABLE hotel_estancias ADD COLUMN IF NOT EXISTS created_by            text;
ALTER TABLE hotel_estancias ADD COLUMN IF NOT EXISTS categoria_preferida   text;  -- cuando no hay habitación específica todavía

CREATE INDEX IF NOT EXISTS idx_estancias_check_in  ON hotel_estancias(check_in_at);
CREATE INDEX IF NOT EXISTS idx_estancias_check_out ON hotel_estancias(check_out_at);
CREATE INDEX IF NOT EXISTS idx_estancias_tarifa    ON hotel_estancias(tarifa_id);

-- ── Tarifas ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hotel_tarifas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre              text NOT NULL,
  tipo                text DEFAULT 'rack',  -- rack|corporate|promocional|temporada|grupo|agencia
  categoria           text,                 -- filtra por categoría de habitación (NULL = todas)
  precio_base         numeric NOT NULL DEFAULT 0,
  incluye_desayuno    boolean DEFAULT false,
  incluye_impuestos   boolean DEFAULT true,
  vigencia_desde      date,
  vigencia_hasta      date,
  min_noches          int DEFAULT 1,
  moneda              text DEFAULT 'COP',
  activo              boolean DEFAULT true,
  color               text,                 -- hex para UI
  notas               text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tarifas_activo    ON hotel_tarifas(activo);
CREATE INDEX IF NOT EXISTS idx_tarifas_tipo      ON hotel_tarifas(tipo);
CREATE INDEX IF NOT EXISTS idx_tarifas_vigencia  ON hotel_tarifas(vigencia_desde, vigencia_hasta);

ALTER TABLE hotel_tarifas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tarifas_all" ON hotel_tarifas;
CREATE POLICY "tarifas_all" ON hotel_tarifas FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON hotel_tarifas TO anon, authenticated;

-- Seed de tarifas base (solo si vacía)
INSERT INTO hotel_tarifas (nombre, tipo, precio_base, incluye_desayuno, activo, color)
SELECT * FROM (VALUES
  ('Rack',              'rack',         550000, false, true, '#8ECAE6'),
  ('Corporate',         'corporate',    420000, true,  true, '#22c55e'),
  ('Temporada Alta',    'temporada',    750000, true,  true, '#f59e0b'),
  ('Temporada Baja',    'temporada',    380000, false, true, '#64748b'),
  ('Agencia',           'agencia',      440000, false, true, '#a78bfa')
) AS v(nombre, tipo, precio_base, incluye_desayuno, activo, color)
WHERE NOT EXISTS (SELECT 1 FROM hotel_tarifas);
