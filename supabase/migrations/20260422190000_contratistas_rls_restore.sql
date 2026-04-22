-- Restaurar policies públicas para el portal de contratistas.
-- Reportado: "new row violates row-level security policy for table contratistas"
-- al intentar guardar borrador desde /contratistas como anon.

DROP POLICY IF EXISTS "public_insert_contratistas" ON public.contratistas;
DROP POLICY IF EXISTS "public_update_own_borrador" ON public.contratistas;
DROP POLICY IF EXISTS "public_select_by_radicado" ON public.contratistas;

CREATE POLICY "public_insert_contratistas" ON public.contratistas
  FOR INSERT TO anon
  WITH CHECK (estado IN ('borrador', 'radicado'));

CREATE POLICY "public_update_own_borrador" ON public.contratistas
  FOR UPDATE TO anon
  USING (estado IN ('borrador', 'radicado'))
  WITH CHECK (estado IN ('borrador', 'radicado'));

-- Permitir a anon leer sus propios registros en borrador/radicado para retomar registro
CREATE POLICY "public_select_own" ON public.contratistas
  FOR SELECT TO anon
  USING (estado IN ('borrador', 'radicado'));

-- Restaurar RLS activo (por si alguien lo apagó)
ALTER TABLE public.contratistas ENABLE ROW LEVEL SECURITY;
