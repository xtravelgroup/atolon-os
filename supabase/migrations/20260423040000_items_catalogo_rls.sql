-- RLS en items_catalogo: permitir lectura/escritura a usuarios autenticados.
-- Reportado: los EAN escaneados desde la app móvil /escanear-productos
-- no se guardaban (PATCH devolvía 204 pero el valor seguía en null).

ALTER TABLE public.items_catalogo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_items_catalogo" ON public.items_catalogo;
DROP POLICY IF EXISTS "auth_insert_items_catalogo" ON public.items_catalogo;
DROP POLICY IF EXISTS "auth_update_items_catalogo" ON public.items_catalogo;
DROP POLICY IF EXISTS "auth_delete_items_catalogo" ON public.items_catalogo;

CREATE POLICY "auth_select_items_catalogo" ON public.items_catalogo
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insert_items_catalogo" ON public.items_catalogo
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_update_items_catalogo" ON public.items_catalogo
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_delete_items_catalogo" ON public.items_catalogo
  FOR DELETE TO authenticated USING (true);

-- Anon: solo lectura (los items son catálogo público)
DROP POLICY IF EXISTS "anon_select_items_catalogo" ON public.items_catalogo;
CREATE POLICY "anon_select_items_catalogo" ON public.items_catalogo
  FOR SELECT TO anon USING (true);

-- Idem para items_stock_locacion, items_proveedores (ya tenían, refuerzo)
ALTER TABLE public.items_proveedores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_items_proveedores" ON public.items_proveedores;
CREATE POLICY "auth_all_items_proveedores" ON public.items_proveedores
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_items_categorias" ON public.items_categorias;
CREATE POLICY "auth_all_items_categorias" ON public.items_categorias
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
