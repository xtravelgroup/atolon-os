-- Bucket privado para documentos de contratistas (hojas de vida, ARL, RUT, PILA, etc.)
INSERT INTO storage.buckets (id, name, public)
VALUES ('contratistas-docs', 'contratistas-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Policies: authenticated (admin OS) puede leer/escribir/borrar
-- Anon puede subir (el contratista usa el portal público sin login)
DROP POLICY IF EXISTS "cont_docs_auth_all" ON storage.objects;
CREATE POLICY "cont_docs_auth_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'contratistas-docs')
  WITH CHECK (bucket_id = 'contratistas-docs');

DROP POLICY IF EXISTS "cont_docs_anon_upload" ON storage.objects;
CREATE POLICY "cont_docs_anon_upload" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id = 'contratistas-docs');
