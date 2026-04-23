-- Fix RLS for RH tables: allow anon role (app uses anon key)
-- Also add usuario_id column to link employees with system users

-- Add anon policies (drop-if-exists pattern for idempotency)
DO $$ BEGIN
  -- rh_departamentos
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rh_departamentos' AND policyname='rh_dept_anon') THEN
    CREATE POLICY rh_dept_anon ON rh_departamentos FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
  -- rh_empleados
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rh_empleados' AND policyname='rh_emp_anon') THEN
    CREATE POLICY rh_emp_anon ON rh_empleados FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
  -- rh_asistencia
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rh_asistencia' AND policyname='rh_asist_anon') THEN
    CREATE POLICY rh_asist_anon ON rh_asistencia FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
  -- rh_vacantes
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rh_vacantes' AND policyname='rh_vac_anon') THEN
    CREATE POLICY rh_vac_anon ON rh_vacantes FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
  -- rh_candidatos
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='rh_candidatos' AND policyname='rh_cand_anon') THEN
    CREATE POLICY rh_cand_anon ON rh_candidatos FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Add usuario_id to rh_empleados to link with system users
ALTER TABLE rh_empleados ADD COLUMN IF NOT EXISTS usuario_id text;
