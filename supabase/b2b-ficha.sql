-- ============================================================
-- B2B FICHA: Locaciones, Contactos, Documentos
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Columnas de documentos en aliados_b2b
ALTER TABLE aliados_b2b ADD COLUMN IF NOT EXISTS rut_url text;
ALTER TABLE aliados_b2b ADD COLUMN IF NOT EXISTS rnt_url text;
ALTER TABLE aliados_b2b ADD COLUMN IF NOT EXISTS cert_bancaria_url text;

-- 2. Tabla locaciones (sedes/sucursales)
CREATE TABLE IF NOT EXISTS b2b_locaciones (
  id text PRIMARY KEY,
  aliado_id text REFERENCES aliados_b2b(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  direccion text,
  ciudad text,
  telefono text,
  notas text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE b2b_locaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON b2b_locaciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Tabla contactos
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

ALTER TABLE b2b_contactos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON b2b_contactos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- NOTA: Crear el bucket "b2b-docs" en:
-- Supabase Dashboard > Storage > New bucket
-- Nombre: b2b-docs  |  Tipo: Public
-- ============================================================
