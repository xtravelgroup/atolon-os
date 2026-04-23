-- Empleados sincronizados desde Loggro Nómina
-- Separado de la tabla `empleados` interna para evitar conflictos.

CREATE TABLE IF NOT EXISTS empleados_loggro (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loggro_id           text UNIQUE NOT NULL,             -- ID del empleado en Loggro
  documento           text,                              -- cédula
  tipo_documento      text,                              -- CC, CE, TI, PP, etc.
  nombres             text,
  apellidos           text,
  nombre_completo     text,
  email               text,
  telefono            text,
  direccion           text,
  ciudad              text,
  fecha_nacimiento    date,
  fecha_ingreso       date,
  fecha_retiro        date,
  cargo               text,
  departamento        text,
  centro_costo        text,
  salario_base        numeric,
  tipo_contrato       text,                              -- Indefinido / Fijo / Obra labor / etc.
  tipo_salario        text,                              -- Integral / Ordinario
  metodo_pago         text,                              -- Transferencia / Efectivo
  banco               text,
  cuenta_bancaria     text,
  eps                 text,
  fondo_pension       text,
  fondo_cesantias     text,
  arl                 text,
  caja_compensacion   text,
  estado              text DEFAULT 'activo',             -- activo / retirado
  ultima_sync         timestamptz DEFAULT now(),
  raw_payload         jsonb,                             -- respuesta completa para auditoría
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_empleados_loggro_estado ON empleados_loggro(estado);
CREATE INDEX IF NOT EXISTS idx_empleados_loggro_docto  ON empleados_loggro(documento);
CREATE INDEX IF NOT EXISTS idx_empleados_loggro_cargo  ON empleados_loggro(cargo);

-- Novedades de nómina (incapacidades, licencias, horas extras, vacaciones, bonos)
CREATE TABLE IF NOT EXISTS empleados_loggro_novedades (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_loggro_id  uuid REFERENCES empleados_loggro(id) ON DELETE CASCADE,
  loggro_novedad_id   text,
  tipo                text,                              -- Incapacidad / Licencia / Hora_extra / Vacacion / Bono
  fecha_inicio        date,
  fecha_fin           date,
  cantidad            numeric,
  valor               numeric,
  descripcion         text,
  raw_payload         jsonb,
  created_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_novedades_empleado ON empleados_loggro_novedades(empleado_loggro_id);
CREATE INDEX IF NOT EXISTS idx_novedades_tipo ON empleados_loggro_novedades(tipo);

-- Log de sincronizaciones
CREATE TABLE IF NOT EXISTS loggro_nomina_sync_log (
  id              bigserial PRIMARY KEY,
  ts              timestamptz DEFAULT now(),
  resultado       text,                                  -- ok / error
  empleados_new   integer DEFAULT 0,
  empleados_upd   integer DEFAULT 0,
  empleados_total integer DEFAULT 0,
  error_msg       text,
  duration_ms     integer,
  raw_response    jsonb
);
CREATE INDEX IF NOT EXISTS idx_nomina_sync_ts ON loggro_nomina_sync_log(ts DESC);

-- RLS
ALTER TABLE empleados_loggro           ENABLE ROW LEVEL SECURITY;
ALTER TABLE empleados_loggro_novedades ENABLE ROW LEVEL SECURITY;
ALTER TABLE loggro_nomina_sync_log     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "empl_loggro_auth_all"      ON empleados_loggro;
CREATE POLICY "empl_loggro_auth_all"      ON empleados_loggro           FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "empl_nov_auth_all"         ON empleados_loggro_novedades;
CREATE POLICY "empl_nov_auth_all"         ON empleados_loggro_novedades FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "nomina_sync_log_auth_read" ON loggro_nomina_sync_log;
CREATE POLICY "nomina_sync_log_auth_read" ON loggro_nomina_sync_log     FOR SELECT TO authenticated USING (true);
