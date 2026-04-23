-- Bucket público para fotos de platos / productos del menú
INSERT INTO storage.buckets (id, name, public)
VALUES ('menu-items', 'menu-items', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Políticas: anon y authenticated pueden subir y leer
DROP POLICY IF EXISTS "menu_items_read" ON storage.objects;
CREATE POLICY "menu_items_read" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'menu-items');

DROP POLICY IF EXISTS "menu_items_insert" ON storage.objects;
CREATE POLICY "menu_items_insert" ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'menu-items');

DROP POLICY IF EXISTS "menu_items_update" ON storage.objects;
CREATE POLICY "menu_items_update" ON storage.objects
  FOR UPDATE TO anon, authenticated USING (bucket_id = 'menu-items');

DROP POLICY IF EXISTS "menu_items_delete" ON storage.objects;
CREATE POLICY "menu_items_delete" ON storage.objects
  FOR DELETE TO anon, authenticated USING (bucket_id = 'menu-items');
