-- ============================================
-- B2B Ficha COMPLETA — v2
-- Locaciones, Contactos, Documentos, Convenios
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- 1. Columnas de documentos en aliados_b2b
ALTER TABLE aliados_b2b ADD COLUMN IF NOT EXISTS rut_url text;
ALTER TABLE aliados_b2b ADD COLUMN IF NOT EXISTS rnt_url text;
ALTER TABLE aliados_b2b ADD COLUMN IF NOT EXISTS cert_bancaria_url text;

-- 2. Locaciones (sedes/sucursales)
CREATE TABLE IF NOT EXISTS b2b_locaciones (
  id text PRIMARY KEY,
  aliado_id text NOT NULL REFERENCES aliados_b2b(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  direccion text,
  ciudad text,
  telefono text,
  notas text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_b2b_loc_aliado ON b2b_locaciones(aliado_id);

-- 3. Contactos — pueden pertenecer a un aliado directamente O a una locacion
CREATE TABLE IF NOT EXISTS b2b_contactos (
  id text PRIMARY KEY,
  aliado_id text REFERENCES aliados_b2b(id) ON DELETE CASCADE,
  locacion_id text REFERENCES b2b_locaciones(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  cargo text,
  telefono text,
  email text,
  es_principal boolean DEFAULT false,
  notas text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_b2b_cont_aliado ON b2b_contactos(aliado_id);
CREATE INDEX IF NOT EXISTS idx_b2b_cont_loc ON b2b_contactos(locacion_id);

-- 4. Convenios — tarifas netas por pasadia por aliado
CREATE TABLE IF NOT EXISTS b2b_convenios (
  id text PRIMARY KEY,
  aliado_id text NOT NULL REFERENCES aliados_b2b(id) ON DELETE CASCADE,
  tipo_pasadia text NOT NULL,
  tarifa_publica integer NOT NULL DEFAULT 0,
  tarifa_neta integer NOT NULL DEFAULT 0,
  comision_pct integer DEFAULT 0,
  activo boolean DEFAULT true,
  notas text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_b2b_conv_aliado ON b2b_convenios(aliado_id);

-- 5. Trigger updated_at para convenios
DROP TRIGGER IF EXISTS set_updated_at ON b2b_convenios;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON b2b_convenios FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 6. RLS para todas las tablas nuevas
ALTER TABLE b2b_locaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_b2b_loc" ON b2b_locaciones;
CREATE POLICY "anon_all_b2b_loc" ON b2b_locaciones FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE b2b_contactos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_b2b_cont" ON b2b_contactos;
CREATE POLICY "anon_all_b2b_cont" ON b2b_contactos FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE b2b_convenios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_b2b_conv" ON b2b_convenios FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================
-- NOTA: Tambien crear bucket en Storage:
-- Storage → New Bucket → nombre: b2b-docs → Public: true
-- ============================================
