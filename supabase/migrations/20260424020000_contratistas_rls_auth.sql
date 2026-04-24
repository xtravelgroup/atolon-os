-- RLS contratistas: agregar policies para authenticated también
-- Reportado: "Error al guardar borrador: new row violates row-level security
-- policy for table contratistas" — las policies previas solo daban acceso a
-- anon. Si el usuario está autenticado (admin), aplica las policies de
-- authenticated que no existían y el insert falla.

ALTER TABLE public.contratistas ENABLE ROW LEVEL SECURITY;

-- ── Authenticated: acceso total ──
DROP POLICY IF EXISTS "auth_all_contratistas" ON public.contratistas;
CREATE POLICY "auth_all_contratistas" ON public.contratistas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Anon: insert/update en estados tempranos (portal público) ──
DROP POLICY IF EXISTS "public_insert_contratistas" ON public.contratistas;
CREATE POLICY "public_insert_contratistas" ON public.contratistas
  FOR INSERT TO anon
  WITH CHECK (estado IN ('borrador', 'radicado'));

DROP POLICY IF EXISTS "public_update_own_borrador" ON public.contratistas;
CREATE POLICY "public_update_own_borrador" ON public.contratistas
  FOR UPDATE TO anon
  USING (estado IN ('borrador', 'radicado'))
  WITH CHECK (estado IN ('borrador', 'radicado'));

DROP POLICY IF EXISTS "public_select_own" ON public.contratistas;
CREATE POLICY "public_select_own" ON public.contratistas
  FOR SELECT TO anon
  USING (estado IN ('borrador', 'radicado'));

-- También contratistas_trabajadores (sub-tabla)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='contratistas_trabajadores') THEN
    EXECUTE 'ALTER TABLE public.contratistas_trabajadores ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "auth_all_contratistas_trabajadores" ON public.contratistas_trabajadores';
    EXECUTE 'CREATE POLICY "auth_all_contratistas_trabajadores" ON public.contratistas_trabajadores FOR ALL TO authenticated USING (true) WITH CHECK (true)';
    EXECUTE 'DROP POLICY IF EXISTS "anon_all_contratistas_trabajadores" ON public.contratistas_trabajadores';
    EXECUTE 'CREATE POLICY "anon_all_contratistas_trabajadores" ON public.contratistas_trabajadores FOR ALL TO anon USING (true) WITH CHECK (true)';
  END IF;
END $$;
