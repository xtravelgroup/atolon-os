-- ============================================================================
-- Migración: Módulo de Contratistas para Atolon OS
-- Versión: 1.0
-- Fecha: 2026-04-20
-- Autor: Interop Colombia S.A.S.
-- ============================================================================
-- Ejecutar en Supabase SQL Editor o a través de CLI:
--   supabase db push
-- ============================================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- TABLA: contratistas
-- ============================================================================
CREATE TABLE IF NOT EXISTS contratistas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  radicado TEXT UNIQUE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('empresa', 'natural')),
  estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN (
    'borrador', 'radicado', 'en_revision', 'devuelto',
    'aprobado', 'rechazado', 'activo', 'cerrado', 'vencido'
  )),

  nombre_display TEXT NOT NULL,
  contacto_principal_email TEXT NOT NULL,
  contacto_principal_cel TEXT NOT NULL,

  -- Empresa
  emp_razon_social TEXT,
  emp_nit TEXT,
  emp_ciiu TEXT,
  emp_direccion TEXT,
  emp_ciudad TEXT,
  emp_tamano TEXT,
  emp_telefono TEXT,
  emp_rl_nombre TEXT,
  emp_rl_cedula TEXT,
  emp_rl_cel TEXT,
  emp_rl_correo TEXT,
  emp_op_nombre TEXT,
  emp_op_cargo TEXT,
  emp_op_cel TEXT,
  emp_op_correo TEXT,
  emp_arl TEXT,
  emp_clase_riesgo TEXT,
  emp_fecha_pila DATE,
  emp_num_pila TEXT,
  emp_sst_nombre TEXT,
  emp_sst_licencia TEXT,
  emp_sst_puntaje TEXT,
  emp_sst_ano INTEGER,

  -- Persona natural
  nat_nombre TEXT,
  nat_cedula TEXT,
  nat_fecha_nac DATE,
  nat_rh TEXT,
  nat_direccion TEXT,
  nat_ciudad TEXT,
  nat_celular TEXT,
  nat_correo TEXT,
  nat_emerg_nombre TEXT,
  nat_emerg_parentesco TEXT,
  nat_emerg_tel TEXT,
  nat_oficio TEXT,
  nat_experiencia INTEGER,
  nat_eps TEXT,
  nat_regimen TEXT,
  nat_afp TEXT,
  nat_caja TEXT,
  nat_arl TEXT,
  nat_arl_estado TEXT,
  nat_curso_completado BOOLEAN DEFAULT FALSE,
  nat_codigo_curso TEXT,

  -- Servicio
  servicio_tipo TEXT,
  servicio_desc TEXT,
  fecha_inicio DATE,
  fecha_fin DATE,
  horario TEXT,
  num_trabajadores INTEGER,
  duracion TEXT,

  -- Firma y declaraciones
  firma_nombre TEXT,
  firma_cedula TEXT,
  firma_ip INET,
  firma_user_agent TEXT,
  firma_timestamp TIMESTAMPTZ,
  declaraciones JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  rejected_reason TEXT,

  search_text TSVECTOR
);

CREATE INDEX IF NOT EXISTS idx_contratistas_radicado ON contratistas(radicado);
CREATE INDEX IF NOT EXISTS idx_contratistas_estado ON contratistas(estado);
CREATE INDEX IF NOT EXISTS idx_contratistas_tipo ON contratistas(tipo);
CREATE INDEX IF NOT EXISTS idx_contratistas_fecha_inicio ON contratistas(fecha_inicio);
CREATE INDEX IF NOT EXISTS idx_contratistas_search ON contratistas USING GIN(search_text);
CREATE INDEX IF NOT EXISTS idx_contratistas_nit ON contratistas(emp_nit);
CREATE INDEX IF NOT EXISTS idx_contratistas_nat_cedula ON contratistas(nat_cedula);

-- Trigger de búsqueda full-text
CREATE OR REPLACE FUNCTION contratistas_search_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_text :=
    setweight(to_tsvector('spanish', coalesce(NEW.radicado, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(NEW.nombre_display, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(NEW.emp_nit, '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(NEW.nat_cedula, '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(NEW.contacto_principal_email, '')), 'C');
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contratistas_search_update ON contratistas;
CREATE TRIGGER contratistas_search_update
  BEFORE INSERT OR UPDATE ON contratistas
  FOR EACH ROW EXECUTE FUNCTION contratistas_search_trigger();

-- ============================================================================
-- TABLA: contratistas_trabajadores
-- ============================================================================
CREATE TABLE IF NOT EXISTS contratistas_trabajadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contratista_id UUID NOT NULL REFERENCES contratistas(id) ON DELETE CASCADE,

  nombre TEXT NOT NULL,
  cedula TEXT NOT NULL,
  cargo TEXT NOT NULL,
  celular TEXT NOT NULL,
  rh TEXT,
  eps TEXT NOT NULL,
  afp TEXT NOT NULL,
  arl TEXT NOT NULL,
  clase_riesgo TEXT NOT NULL,
  emerg_nombre TEXT NOT NULL,
  emerg_tel TEXT NOT NULL,

  curso_completado BOOLEAN DEFAULT FALSE,
  codigo_curso TEXT,
  fecha_curso DATE,
  curso_token TEXT UNIQUE,

  ruaf_verificado BOOLEAN DEFAULT FALSE,
  ruaf_fecha_consulta TIMESTAMPTZ,
  ruaf_resultado JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trabajadores_contratista ON contratistas_trabajadores(contratista_id);
CREATE INDEX IF NOT EXISTS idx_trabajadores_cedula ON contratistas_trabajadores(cedula);
CREATE INDEX IF NOT EXISTS idx_trabajadores_token ON contratistas_trabajadores(curso_token);
CREATE INDEX IF NOT EXISTS idx_trabajadores_curso_completado ON contratistas_trabajadores(curso_completado);

-- ============================================================================
-- TABLA: contratistas_documentos
-- ============================================================================
CREATE TABLE IF NOT EXISTS contratistas_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contratista_id UUID NOT NULL REFERENCES contratistas(id) ON DELETE CASCADE,
  trabajador_id UUID REFERENCES contratistas_trabajadores(id) ON DELETE SET NULL,

  tipo TEXT NOT NULL,
  nombre_original TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,

  validado BOOLEAN DEFAULT FALSE,
  validado_por UUID,
  validado_at TIMESTAMPTZ,
  observaciones TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_docs_contratista ON contratistas_documentos(contratista_id);
CREATE INDEX IF NOT EXISTS idx_docs_tipo ON contratistas_documentos(tipo);
CREATE INDEX IF NOT EXISTS idx_docs_trabajador ON contratistas_documentos(trabajador_id);

-- ============================================================================
-- TABLA: certificados_curso
-- ============================================================================
CREATE TABLE IF NOT EXISTS certificados_curso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE NOT NULL,

  trabajador_id UUID REFERENCES contratistas_trabajadores(id) ON DELETE SET NULL,
  contratista_id UUID REFERENCES contratistas(id) ON DELETE SET NULL,

  nombre TEXT NOT NULL,
  cedula TEXT NOT NULL,
  empresa TEXT,
  oficio TEXT,
  telefono TEXT,

  score INTEGER NOT NULL,
  total_questions INTEGER DEFAULT 10,
  passed BOOLEAN NOT NULL,
  answers JSONB,

  issued_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  ip INET,
  user_agent TEXT,
  pdf_path TEXT
);

CREATE INDEX IF NOT EXISTS idx_certs_codigo ON certificados_curso(codigo);
CREATE INDEX IF NOT EXISTS idx_certs_cedula ON certificados_curso(cedula);
CREATE INDEX IF NOT EXISTS idx_certs_trabajador ON certificados_curso(trabajador_id);
CREATE INDEX IF NOT EXISTS idx_certs_expires ON certificados_curso(expires_at);
CREATE INDEX IF NOT EXISTS idx_certs_passed ON certificados_curso(passed);

-- Trigger para establecer expires_at automáticamente
CREATE OR REPLACE FUNCTION set_cert_expiration() RETURNS trigger AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NEW.issued_at + INTERVAL '1 year';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS certs_set_expiration ON certificados_curso;
CREATE TRIGGER certs_set_expiration
  BEFORE INSERT ON certificados_curso
  FOR EACH ROW EXECUTE FUNCTION set_cert_expiration();

-- ============================================================================
-- TABLA: contratistas_bitacora
-- ============================================================================
CREATE TABLE IF NOT EXISTS contratistas_bitacora (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contratista_id UUID NOT NULL REFERENCES contratistas(id) ON DELETE CASCADE,

  evento TEXT NOT NULL,
  estado_anterior TEXT,
  estado_nuevo TEXT,
  descripcion TEXT,
  metadata JSONB,

  usuario_id UUID,
  usuario_nombre TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bitacora_contratista ON contratistas_bitacora(contratista_id);
CREATE INDEX IF NOT EXISTS idx_bitacora_evento ON contratistas_bitacora(evento);
CREATE INDEX IF NOT EXISTS idx_bitacora_fecha ON contratistas_bitacora(created_at DESC);

-- ============================================================================
-- TABLA: ingresos_diarios
-- ============================================================================
CREATE TABLE IF NOT EXISTS ingresos_diarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,

  trabajador_id UUID REFERENCES contratistas_trabajadores(id) ON DELETE SET NULL,
  contratista_id UUID NOT NULL REFERENCES contratistas(id) ON DELETE CASCADE,

  cedula TEXT NOT NULL,
  nombre TEXT NOT NULL,

  ingreso_at TIMESTAMPTZ,
  ingreso_muelle TEXT,
  ingreso_verificado_por UUID,
  salida_at TIMESTAMPTZ,
  salida_verificado_por UUID,

  cert_curso_valido BOOLEAN,
  arl_valido BOOLEAN,
  observaciones TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingresos_fecha ON ingresos_diarios(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_ingresos_cedula ON ingresos_diarios(cedula);
CREATE INDEX IF NOT EXISTS idx_ingresos_contratista ON ingresos_diarios(contratista_id);
CREATE INDEX IF NOT EXISTS idx_ingresos_trabajador ON ingresos_diarios(trabajador_id);

-- ============================================================================
-- TABLA: contratistas_notificaciones
-- ============================================================================
CREATE TABLE IF NOT EXISTS contratistas_notificaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contratista_id UUID REFERENCES contratistas(id) ON DELETE CASCADE,
  trabajador_id UUID REFERENCES contratistas_trabajadores(id) ON DELETE CASCADE,

  canal TEXT NOT NULL CHECK (canal IN ('email', 'whatsapp', 'sms')),
  tipo TEXT NOT NULL,
  destinatario TEXT NOT NULL,
  asunto TEXT,
  cuerpo TEXT,

  enviado BOOLEAN DEFAULT FALSE,
  enviado_at TIMESTAMPTZ,
  error TEXT,
  metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_contratista ON contratistas_notificaciones(contratista_id);
CREATE INDEX IF NOT EXISTS idx_notif_pendientes ON contratistas_notificaciones(enviado) WHERE enviado = FALSE;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE contratistas ENABLE ROW LEVEL SECURITY;
ALTER TABLE contratistas_trabajadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE contratistas_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificados_curso ENABLE ROW LEVEL SECURITY;
ALTER TABLE contratistas_bitacora ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingresos_diarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE contratistas_notificaciones ENABLE ROW LEVEL SECURITY;

-- Policies públicas (anonymous)
CREATE POLICY "public_insert_contratistas" ON contratistas
  FOR INSERT TO anon
  WITH CHECK (estado IN ('borrador', 'radicado'));

CREATE POLICY "public_update_own_borrador" ON contratistas
  FOR UPDATE TO anon
  USING (estado IN ('borrador', 'radicado'))
  WITH CHECK (estado IN ('borrador', 'radicado'));

CREATE POLICY "public_insert_trabajadores" ON contratistas_trabajadores
  FOR INSERT TO anon
  WITH CHECK (TRUE);

CREATE POLICY "public_update_trabajadores" ON contratistas_trabajadores
  FOR UPDATE TO anon
  USING (TRUE);

CREATE POLICY "public_delete_trabajadores" ON contratistas_trabajadores
  FOR DELETE TO anon
  USING (TRUE);

CREATE POLICY "public_insert_docs" ON contratistas_documentos
  FOR INSERT TO anon
  WITH CHECK (TRUE);

CREATE POLICY "public_insert_certs" ON certificados_curso
  FOR INSERT TO anon
  WITH CHECK (TRUE);

CREATE POLICY "public_select_cert_by_code" ON certificados_curso
  FOR SELECT TO anon
  USING (TRUE);

-- Policies internas (authenticated)
CREATE POLICY "admin_all_contratistas" ON contratistas
  FOR ALL TO authenticated
  USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "admin_all_trabajadores" ON contratistas_trabajadores
  FOR ALL TO authenticated
  USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "admin_all_docs" ON contratistas_documentos
  FOR ALL TO authenticated
  USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "admin_all_certs" ON certificados_curso
  FOR ALL TO authenticated
  USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "admin_all_bitacora" ON contratistas_bitacora
  FOR ALL TO authenticated
  USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "admin_all_ingresos" ON ingresos_diarios
  FOR ALL TO authenticated
  USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "admin_all_notif" ON contratistas_notificaciones
  FOR ALL TO authenticated
  USING (TRUE) WITH CHECK (TRUE);

-- ============================================================================
-- FUNCIÓN HELPER: generar radicado único
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_radicado(tipo_contratista TEXT) RETURNS TEXT AS $$
DECLARE
  prefix TEXT;
  date_part TEXT;
  random_part TEXT;
  new_radicado TEXT;
  exists_count INTEGER;
BEGIN
  prefix := CASE WHEN tipo_contratista = 'empresa' THEN 'EMP' ELSE 'NAT' END;
  date_part := to_char(NOW(), 'YYMMDD');

  LOOP
    random_part := upper(substring(md5(random()::text) FROM 1 FOR 6));
    new_radicado := 'ATL-' || prefix || '-' || date_part || '-' || random_part;

    SELECT COUNT(*) INTO exists_count FROM contratistas WHERE radicado = new_radicado;
    EXIT WHEN exists_count = 0;
  END LOOP;

  RETURN new_radicado;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCIÓN HELPER: generar token único de curso
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_curso_token() RETURNS TEXT AS $$
DECLARE
  new_token TEXT;
  exists_count INTEGER;
BEGIN
  LOOP
    new_token := encode(gen_random_bytes(24), 'hex');
    SELECT COUNT(*) INTO exists_count FROM contratistas_trabajadores WHERE curso_token = new_token;
    EXIT WHEN exists_count = 0;
  END LOOP;
  RETURN new_token;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCIÓN HELPER: generar código único de certificado
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_cert_code() RETURNS TEXT AS $$
DECLARE
  date_part TEXT;
  random_part TEXT;
  new_code TEXT;
  exists_count INTEGER;
BEGIN
  date_part := to_char(NOW(), 'DDMMYYYY');

  LOOP
    random_part := upper(substring(md5(random()::text) FROM 1 FOR 8));
    new_code := 'ATL-' || date_part || '-' || random_part;
    SELECT COUNT(*) INTO exists_count FROM certificados_curso WHERE codigo = new_code;
    EXIT WHEN exists_count = 0;
  END LOOP;
  RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VISTA: contratistas_dashboard
-- ============================================================================
CREATE OR REPLACE VIEW contratistas_dashboard AS
SELECT
  DATE(created_at) as fecha,
  COUNT(*) FILTER (WHERE estado = 'radicado') as radicados,
  COUNT(*) FILTER (WHERE estado = 'en_revision') as en_revision,
  COUNT(*) FILTER (WHERE estado = 'aprobado') as aprobados,
  COUNT(*) FILTER (WHERE estado = 'rechazado') as rechazados,
  COUNT(*) FILTER (WHERE estado = 'activo') as activos,
  COUNT(*) as total
FROM contratistas
GROUP BY DATE(created_at)
ORDER BY fecha DESC;

-- ============================================================================
-- VISTA: trabajadores_hoy_en_isla
-- ============================================================================
CREATE OR REPLACE VIEW trabajadores_hoy_en_isla AS
SELECT
  i.id,
  i.cedula,
  i.nombre,
  i.ingreso_at,
  i.ingreso_muelle,
  c.radicado,
  c.nombre_display as empresa_o_contratista,
  c.tipo,
  t.cargo,
  t.arl,
  t.emerg_nombre,
  t.emerg_tel
FROM ingresos_diarios i
LEFT JOIN contratistas_trabajadores t ON t.id = i.trabajador_id
LEFT JOIN contratistas c ON c.id = i.contratista_id
WHERE i.fecha = CURRENT_DATE
  AND i.ingreso_at IS NOT NULL
  AND i.salida_at IS NULL
ORDER BY i.ingreso_at DESC;

-- ============================================================================
-- VISTA: certificados_a_vencer_30_dias
-- ============================================================================
CREATE OR REPLACE VIEW certificados_a_vencer_30_dias AS
SELECT
  c.codigo,
  c.nombre,
  c.cedula,
  c.empresa,
  c.issued_at,
  c.expires_at,
  DATE_PART('day', c.expires_at - NOW()) as dias_restantes
FROM certificados_curso c
WHERE c.passed = TRUE
  AND c.expires_at > NOW()
  AND c.expires_at < NOW() + INTERVAL '30 days'
ORDER BY c.expires_at ASC;

-- ============================================================================
-- STORAGE BUCKETS
-- ============================================================================
-- Ejecutar desde el Dashboard de Supabase o vía CLI:
--   supabase storage create contratistas-docs --private
--   supabase storage create certificados --private
--
-- O vía SQL si el proyecto lo permite:
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('contratistas-docs', 'contratistas-docs', false),
  ('certificados', 'certificados', false)
ON CONFLICT (id) DO NOTHING;

-- Policies de storage
CREATE POLICY "anon_upload_contratistas_docs" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id = 'contratistas-docs');

CREATE POLICY "auth_all_contratistas_docs" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id IN ('contratistas-docs', 'certificados'))
  WITH CHECK (bucket_id IN ('contratistas-docs', 'certificados'));

-- ============================================================================
-- SEED DATA (opcional - solo para testing)
-- ============================================================================
-- Descomenta para crear datos de prueba:
/*
INSERT INTO contratistas (
  radicado, tipo, estado, nombre_display,
  contacto_principal_email, contacto_principal_cel,
  emp_razon_social, emp_nit, emp_rl_nombre, emp_rl_cedula
) VALUES (
  'ATL-EMP-260420-TEST01', 'empresa', 'radicado',
  'Empresa de Prueba S.A.S.',
  'test@example.com', '3001234567',
  'Empresa de Prueba S.A.S.', '900123456-7',
  'Juan Pérez', '79123456'
);
*/

-- ============================================================================
-- FIN DE MIGRACIÓN
-- ============================================================================
