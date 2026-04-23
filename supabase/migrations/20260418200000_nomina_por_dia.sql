-- Nómina por día (trabajadores ocasionales / por jornada)
CREATE TABLE IF NOT EXISTS nomina_por_dia (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha              date NOT NULL,
  empleado_loggro_id uuid REFERENCES empleados_loggro(id) ON DELETE SET NULL,
  nombre             text NOT NULL,
  documento          text,
  cargo              text,
  area               text,
  valor_dia          numeric NOT NULL DEFAULT 0,
  horas              numeric DEFAULT 8,
  transporte         numeric DEFAULT 0,
  bonificacion       numeric DEFAULT 0,
  total              numeric GENERATED ALWAYS AS (valor_dia + COALESCE(transporte,0) + COALESCE(bonificacion,0)) STORED,
  metodo_pago        text DEFAULT 'efectivo',  -- efectivo / transferencia / otro
  pagado             boolean DEFAULT false,
  comprobante_url    text,
  notas              text,
  registrado_por     text,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nomina_dia_fecha ON nomina_por_dia(fecha);
CREATE INDEX IF NOT EXISTS idx_nomina_dia_emp   ON nomina_por_dia(empleado_loggro_id);
CREATE INDEX IF NOT EXISTS idx_nomina_dia_pagado ON nomina_por_dia(pagado);

ALTER TABLE nomina_por_dia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nomina_dia_auth_all" ON nomina_por_dia;
CREATE POLICY "nomina_dia_auth_all" ON nomina_por_dia FOR ALL TO authenticated USING (true) WITH CHECK (true);
