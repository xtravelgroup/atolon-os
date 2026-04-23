-- Bucket privado para certificados PDF
INSERT INTO storage.buckets (id, name, public)
VALUES ('contratistas-certificados', 'contratistas-certificados', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "cont_certs_auth_all" ON storage.objects;
CREATE POLICY "cont_certs_auth_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'contratistas-certificados')
  WITH CHECK (bucket_id = 'contratistas-certificados');
