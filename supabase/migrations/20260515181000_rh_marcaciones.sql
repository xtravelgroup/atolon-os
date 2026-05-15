-- Marcaciones (entrada/salida por día) para Procesar Nómina.
-- El operador captura, por empleado y por día de la quincena, hora de
-- entrada y salida. nominaCalculator deriva horas + recargos + base.

CREATE TABLE IF NOT EXISTS rh_marcaciones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id  uuid NOT NULL REFERENCES rh_empleados(id) ON DELETE CASCADE,
  fecha        date NOT NULL,
  entrada      time,
  salida       time,
  periodo      text,          -- etiqueta de la quincena: "Pago 15 May 2026"
  notas        text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  CONSTRAINT rh_marcaciones_emp_fecha_uniq UNIQUE (empleado_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_rh_marc_emp     ON rh_marcaciones(empleado_id);
CREATE INDEX IF NOT EXISTS idx_rh_marc_fecha   ON rh_marcaciones(fecha);
CREATE INDEX IF NOT EXISTS idx_rh_marc_periodo ON rh_marcaciones(periodo);

ALTER TABLE rh_marcaciones ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rh_marcaciones' AND policyname='rh_marc_anon') THEN
    CREATE POLICY rh_marc_anon ON rh_marcaciones FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rh_marcaciones' AND policyname='rh_marc_auth') THEN
    CREATE POLICY rh_marc_auth ON rh_marcaciones FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
