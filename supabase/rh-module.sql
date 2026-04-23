-- ─────────────────────────────────────────────────────────────
-- MÓDULO RECURSOS HUMANOS — Atolon Beach Club
-- Ley colombiana: Código Sustantivo del Trabajo
-- SMMLV 2026: $1,423,500 | Auxilio Transporte: $200,000
-- ─────────────────────────────────────────────────────────────

-- 1. Departamentos
CREATE TABLE IF NOT EXISTS rh_departamentos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL,
  descripcion text,
  color       text NOT NULL DEFAULT '#8ECAE6',
  activo      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

-- 2. Empleados
CREATE TABLE IF NOT EXISTS rh_empleados (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identidad
  nombres               text NOT NULL,
  apellidos             text NOT NULL,
  cedula                text UNIQUE,
  fecha_nacimiento      date,
  genero                text CHECK (genero IN ('M','F','Otro')),
  -- Contacto
  email                 text,
  telefono              text,
  direccion             text,
  ciudad                text DEFAULT 'Cartagena',
  -- Laboral
  cargo                 text NOT NULL,
  departamento_id       uuid REFERENCES rh_departamentos(id) ON DELETE SET NULL,
  jefe_id               uuid REFERENCES rh_empleados(id) ON DELETE SET NULL,
  tipo_contrato         text CHECK (tipo_contrato IN ('indefinido','termino_fijo','obra_labor','prestacion_servicios')),
  fecha_ingreso         date,
  fecha_fin_contrato    date,
  periodo_prueba_fin    date,
  -- Económico
  salario_base          numeric NOT NULL DEFAULT 1423500,
  modalidad_pago        text DEFAULT 'quincenal' CHECK (modalidad_pago IN ('quincenal','mensual')),
  banco                 text,
  cuenta_bancaria       text,
  tipo_cuenta           text CHECK (tipo_cuenta IN ('ahorros','corriente')),
  -- Seguridad Social
  eps                   text,
  fondo_pension         text,
  fondo_cesantias       text,
  arl                   text DEFAULT 'Positiva',
  caja_compensacion     text DEFAULT 'Comfamiliar',
  nivel_riesgo_arl      integer DEFAULT 1 CHECK (nivel_riesgo_arl BETWEEN 1 AND 5),
  -- Estado
  activo                boolean DEFAULT true,
  avatar_color          text DEFAULT '#8ECAE6',
  notas                 text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- Actualizar jefe en departamentos ahora que existe rh_empleados
ALTER TABLE rh_departamentos ADD COLUMN IF NOT EXISTS jefe_id uuid REFERENCES rh_empleados(id) ON DELETE SET NULL;

-- 3. Asistencia
CREATE TABLE IF NOT EXISTS rh_asistencia (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id     uuid NOT NULL REFERENCES rh_empleados(id) ON DELETE CASCADE,
  fecha           date NOT NULL,
  estado          text NOT NULL CHECK (estado IN ('presente','ausente','tardanza','permiso','vacaciones','incapacidad')),
  hora_entrada    text,
  hora_salida     text,
  minutos_tarde   integer DEFAULT 0,
  observacion     text,
  registrado_por  text,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(empleado_id, fecha)
);

-- 4. Vacantes
CREATE TABLE IF NOT EXISTS rh_vacantes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo          text NOT NULL,
  departamento_id uuid REFERENCES rh_departamentos(id) ON DELETE SET NULL,
  tipo_contrato   text CHECK (tipo_contrato IN ('indefinido','termino_fijo','obra_labor','prestacion_servicios')),
  salario_oferta  numeric,
  descripcion     text,
  requisitos      text,
  estado          text DEFAULT 'abierta' CHECK (estado IN ('abierta','pausada','cerrada')),
  solicitado_por  text,
  prioridad       text DEFAULT 'Media' CHECK (prioridad IN ('Baja','Media','Alta','Urgente')),
  fecha_limite    date,
  created_at      timestamptz DEFAULT now()
);

-- 5. Candidatos
CREATE TABLE IF NOT EXISTS rh_candidatos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vacante_id  uuid NOT NULL REFERENCES rh_vacantes(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  email       text,
  telefono    text,
  etapa       text NOT NULL DEFAULT 'aplicado'
              CHECK (etapa IN ('aplicado','entrevista_rh','prueba_tecnica','entrevista_final','oferta','contratado','descartado')),
  cv_url      text,
  notas       text,
  calificacion integer CHECK (calificacion BETWEEN 1 AND 5),
  created_at  timestamptz DEFAULT now()
);

-- RLS policies
ALTER TABLE rh_departamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE rh_empleados     ENABLE ROW LEVEL SECURITY;
ALTER TABLE rh_asistencia    ENABLE ROW LEVEL SECURITY;
ALTER TABLE rh_vacantes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE rh_candidatos    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rh_dept_all"      ON rh_departamentos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rh_emp_all"       ON rh_empleados     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rh_asist_all"     ON rh_asistencia    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rh_vac_all"       ON rh_vacantes      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rh_cand_all"      ON rh_candidatos    FOR ALL TO authenticated USING (true) WITH CHECK (true);
