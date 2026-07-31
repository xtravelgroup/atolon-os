-- Catálogo separado de trabajadores extra / eventuales / por día.
-- No mezclar con empleados_loggro (nómina fija).
-- Uso: selector en Nómina por Día para pre-llenar nombre/doc/cargo/tarifa
-- sin re-tipear cada vez.

CREATE TABLE IF NOT EXISTS trabajadores_extra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  documento text,
  cargo text,
  tarifa_dia_default numeric,
  telefono text,
  notas text,
  activo boolean NOT NULL DEFAULT true,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (documento)
);

CREATE INDEX IF NOT EXISTS idx_trab_extra_activo ON trabajadores_extra(activo);
CREATE INDEX IF NOT EXISTS idx_trab_extra_nombre ON trabajadores_extra(nombre);

-- RLS mínima (baseline; la app ya filtra por rol/depto donde aplica)
ALTER TABLE trabajadores_extra ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'trabajadores_extra'::regclass AND polname = 'trab_extra_all') THEN
    CREATE POLICY trab_extra_all ON trabajadores_extra FOR ALL
      TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE trabajadores_extra IS
  'Personal eventual/por día (no nómina fija). Usado por NominaPorDia como catálogo de referencia.';
