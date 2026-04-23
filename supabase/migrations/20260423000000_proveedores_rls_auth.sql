-- RLS proveedores: permitir a usuarios autenticados leer y escribir
-- Reportado: "new row violates row-level security policy for table proveedores"

ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_proveedores" ON public.proveedores;
DROP POLICY IF EXISTS "auth_insert_proveedores" ON public.proveedores;
DROP POLICY IF EXISTS "auth_update_proveedores" ON public.proveedores;
DROP POLICY IF EXISTS "auth_delete_proveedores" ON public.proveedores;

CREATE POLICY "auth_select_proveedores" ON public.proveedores
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insert_proveedores" ON public.proveedores
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_update_proveedores" ON public.proveedores
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_delete_proveedores" ON public.proveedores
  FOR DELETE TO authenticated USING (true);

-- Lo mismo para proveedor_contactos
ALTER TABLE public.proveedor_contactos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_proveedor_contactos" ON public.proveedor_contactos;
CREATE POLICY "auth_all_proveedor_contactos" ON public.proveedor_contactos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
