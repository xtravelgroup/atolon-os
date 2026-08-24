-- ═══════════════════════════════════════════════════════════════════════
-- embarcacion_proveedores — Catálogo de embarcaciones externas (rentadas)
-- ═══════════════════════════════════════════════════════════════════════
-- Distinta de la tabla `embarcaciones` (que es maestro de flota propia +
-- rentadas para precios/rutas). Esta guarda las embarcaciones de terceros
-- que se contratan con datos legales y bancarios para poder pagarles.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS embarcacion_proveedores (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_embarcacion   text NOT NULL,
  tipo                 text,        -- Deportiva · Lancha · Yate · Catamarán · Bote · Otro
  capacidad            int,
  matricula            text,

  -- Propietario / empresa proveedora
  propietario_nombre   text,
  propietario_documento text,       -- NIT / CC
  propietario_telefono text,
  propietario_email    text,

  -- Datos bancarios
  banco                text,
  cuenta_tipo          text,        -- ahorros · corriente
  cuenta_numero        text,
  cuenta_titular       text,

  -- Documentos adjuntos (URLs a storage bucket 'embarcacion-docs')
  rut_url              text,
  certificacion_bancaria_url text,
  otros_docs           jsonb DEFAULT '[]'::jsonb,   -- [{nombre, url}]

  -- Referencia (precios estimados por ruta)
  precios_referencia   jsonb DEFAULT '{}'::jsonb,
  notas                text,
  activo               boolean DEFAULT true,

  created_by           text,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ep_nombre ON embarcacion_proveedores(nombre_embarcacion);
CREATE INDEX IF NOT EXISTS idx_ep_activo ON embarcacion_proveedores(activo);

-- Auto-touch updated_at
CREATE OR REPLACE FUNCTION ep_touch_updated() RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ep_updated ON embarcacion_proveedores;
CREATE TRIGGER trg_ep_updated BEFORE UPDATE ON embarcacion_proveedores
  FOR EACH ROW EXECUTE FUNCTION ep_touch_updated();

ALTER TABLE embarcacion_proveedores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ep_auth_all" ON embarcacion_proveedores;
CREATE POLICY "ep_auth_all" ON embarcacion_proveedores FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Vincular solicitudes al proveedor seleccionado
ALTER TABLE embarcacion_solicitudes
  ADD COLUMN IF NOT EXISTS embarcacion_proveedor_id uuid REFERENCES embarcacion_proveedores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_es_proveedor_id ON embarcacion_solicitudes(embarcacion_proveedor_id) WHERE embarcacion_proveedor_id IS NOT NULL;

COMMENT ON TABLE embarcacion_proveedores IS
  'Catálogo de embarcaciones de terceros contratadas para servicios. Incluye datos legales del propietario, cuenta bancaria y adjuntos RUT + certificación bancaria.';

-- Storage bucket para adjuntos (RUT, cert bancaria, otros docs)
INSERT INTO storage.buckets (id, name, public)
  VALUES ('embarcacion-docs', 'embarcacion-docs', false)
  ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated puede leer/subir/borrar en su bucket
DROP POLICY IF EXISTS "ep_docs_read"   ON storage.objects;
DROP POLICY IF EXISTS "ep_docs_write"  ON storage.objects;
DROP POLICY IF EXISTS "ep_docs_update" ON storage.objects;
DROP POLICY IF EXISTS "ep_docs_delete" ON storage.objects;

CREATE POLICY "ep_docs_read"   ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'embarcacion-docs');
CREATE POLICY "ep_docs_write"  ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'embarcacion-docs');
CREATE POLICY "ep_docs_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'embarcacion-docs');
CREATE POLICY "ep_docs_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'embarcacion-docs');
