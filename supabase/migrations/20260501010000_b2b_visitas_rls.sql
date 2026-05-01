-- b2b_visitas tenía RLS activado pero CERO políticas, lo que bloqueaba
-- silenciosamente todas las operaciones (insert/update/delete). El usuario
-- agregaba una visita y la pantalla decía "guardado" pero nada se persistía.
-- Patrón consistente con el resto de tablas de la app (admin permisivo,
-- el control de acceso está a nivel de UI/módulos).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'b2b_visitas'::regclass AND polname = 'b2b_visitas_all_anon') THEN
    EXECUTE 'CREATE POLICY b2b_visitas_all_anon ON b2b_visitas FOR ALL TO anon USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'b2b_visitas'::regclass AND polname = 'b2b_visitas_all_auth') THEN
    EXECUTE 'CREATE POLICY b2b_visitas_all_auth ON b2b_visitas FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;
