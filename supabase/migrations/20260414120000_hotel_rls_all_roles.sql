-- Extend hotel tables RLS to authenticated + service_role, not just anon
DROP POLICY IF EXISTS "categorias_anon_all" ON hotel_categorias;
DROP POLICY IF EXISTS "categorias_all" ON hotel_categorias;
CREATE POLICY "categorias_all" ON hotel_categorias FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON hotel_categorias TO anon, authenticated;

DROP POLICY IF EXISTS "habitaciones_anon_all" ON hotel_habitaciones;
DROP POLICY IF EXISTS "habitaciones_all" ON hotel_habitaciones;
CREATE POLICY "habitaciones_all" ON hotel_habitaciones FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON hotel_habitaciones TO anon, authenticated;
