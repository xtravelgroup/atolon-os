-- Bucket "comprobantes" existía pero sin policies en storage.objects
-- → todo INSERT/SELECT era rechazado. Los agentes B2B intentando subir
-- foto/PDF del comprobante veían "Error subiendo el comprobante" genérico.
--
-- El bucket es público (public=true) pero eso solo afecta la URL, no las
-- policies de acceso — sigue haciendo falta autorización explícita.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy
                  WHERE polrelid = 'storage.objects'::regclass
                    AND polname  = 'comprobantes_insert_anon') THEN
    CREATE POLICY comprobantes_insert_anon
      ON storage.objects FOR INSERT TO anon, authenticated
      WITH CHECK (bucket_id = 'comprobantes');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policy
                  WHERE polrelid = 'storage.objects'::regclass
                    AND polname  = 'comprobantes_select_anon') THEN
    CREATE POLICY comprobantes_select_anon
      ON storage.objects FOR SELECT TO anon, authenticated
      USING (bucket_id = 'comprobantes');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policy
                  WHERE polrelid = 'storage.objects'::regclass
                    AND polname  = 'comprobantes_update_anon') THEN
    CREATE POLICY comprobantes_update_anon
      ON storage.objects FOR UPDATE TO anon, authenticated
      USING (bucket_id = 'comprobantes')
      WITH CHECK (bucket_id = 'comprobantes');
  END IF;
END $$;
