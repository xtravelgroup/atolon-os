-- Flujo supervisor-aprobación de nómina por departamento.
--
-- Cada rh_departamento tiene un supervisor_email. En ProcesarNomina el
-- supervisor solo ve empleados de sus deptos y aprueba la nómina cuando
-- las horas del reloj están correctas. Aprobar BLOQUEA la edición hasta
-- que un super_admin desapruebe.
--
-- Auditoría en rh_marcaciones: quién editó y por qué (los supervisores
-- pueden corregir marcaciones olvidadas o mal capturadas).

-- 1. Supervisor por departamento
ALTER TABLE rh_departamentos
  ADD COLUMN IF NOT EXISTS supervisor_email text;

-- 2. Aprobaciones de nómina — un registro por (periodo, depto).
--    periodo_key formato: "YYYY-MM-Q1" (pago 15) o "YYYY-MM-Q2" (pago 30).
--    - Q1 (pago 15) cubre novedades 26-mes-anterior → 10-mes-actual
--    - Q2 (pago 30) cubre novedades 11 → 25
CREATE TABLE IF NOT EXISTS nomina_aprobaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_key text NOT NULL,
  departamento_id text NOT NULL,
  estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','aprobado')),
  supervisor_email text,
  aprobado_at timestamptz,
  desaprobado_por text,
  desaprobado_at timestamptz,
  notas text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (periodo_key, departamento_id)
);

CREATE INDEX IF NOT EXISTS idx_nomina_aprob_periodo ON nomina_aprobaciones(periodo_key);
CREATE INDEX IF NOT EXISTS idx_nomina_aprob_depto ON nomina_aprobaciones(departamento_id);

-- 3. Auditoría en rh_marcaciones
ALTER TABLE rh_marcaciones
  ADD COLUMN IF NOT EXISTS editado_por text,
  ADD COLUMN IF NOT EXISTS editado_at timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_edicion text,
  ADD COLUMN IF NOT EXISTS origen text DEFAULT 'reloj';  -- reloj | manual | ajuste_supervisor

-- 4. RLS: mínimo — anon/authenticated pueden leer/escribir aprobaciones
--    (la app ya valida rol/depto en frontend; este es solo baseline)
ALTER TABLE nomina_aprobaciones ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'nomina_aprobaciones'::regclass AND polname = 'nomina_aprob_all') THEN
    CREATE POLICY nomina_aprob_all ON nomina_aprobaciones FOR ALL
      TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE nomina_aprobaciones IS
  'Aprobación por depto+periodo. Aprobar bloquea la edición hasta desaprobación por super_admin. Ver src/modules/ProcesarNomina.jsx.';
COMMENT ON COLUMN rh_departamentos.supervisor_email IS
  'Email del supervisor del departamento. En ProcesarNomina, ese usuario ve/aprueba solo su depto.';
