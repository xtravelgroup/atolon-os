CREATE TABLE IF NOT EXISTS muelle_llegadas (
  id text PRIMARY KEY,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  hora_llegada time,
  hora_salida time,
  tipo text NOT NULL CHECK (tipo IN ('lancha_atolon','after_island','restaurante')),
  embarcacion_nombre text,
  matricula text,
  pax_a int DEFAULT 0,
  pax_n int DEFAULT 0,
  pax_total int DEFAULT 0,
  reserva_id text,
  salida_id text,
  estado text DEFAULT 'esperada' CHECK (estado IN ('esperada','llegó','en_isla','salió')),
  total_cobrado numeric DEFAULT 0,
  metodo_pago text CHECK (metodo_pago IN ('efectivo','transferencia','datafono')),
  notas text,
  creado_por text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE muelle_llegadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "muelle_all" ON muelle_llegadas FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS muelle_llegadas_fecha_idx ON muelle_llegadas(fecha);
