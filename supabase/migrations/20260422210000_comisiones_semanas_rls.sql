-- RLS comisiones_semanas: solo Eric, Emma y Violeta pueden aprobar/ejecutar
-- Reportado: "new row violates row-level security policy for table comisiones_semanas"

ALTER TABLE public.comisiones_semanas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_comisiones_semanas" ON public.comisiones_semanas;
DROP POLICY IF EXISTS "auth_insert_comisiones_semanas" ON public.comisiones_semanas;
DROP POLICY IF EXISTS "auth_update_comisiones_semanas" ON public.comisiones_semanas;
DROP POLICY IF EXISTS "auth_delete_comisiones_semanas" ON public.comisiones_semanas;

-- SELECT: cualquier autenticado puede ver
CREATE POLICY "auth_select_comisiones_semanas" ON public.comisiones_semanas
  FOR SELECT TO authenticated USING (true);

-- INSERT/UPDATE/DELETE: solo los tres aprobadores autorizados
CREATE POLICY "aprobadores_insert_comisiones_semanas" ON public.comisiones_semanas
  FOR INSERT TO authenticated
  WITH CHECK (
    lower(auth.jwt() ->> 'email') IN (
      'eric@atoloncartagena.com',
      'direccion@atoloncartagena.com',
      'vsimancas@atoloncartagena.com'
    )
  );

CREATE POLICY "aprobadores_update_comisiones_semanas" ON public.comisiones_semanas
  FOR UPDATE TO authenticated
  USING (
    lower(auth.jwt() ->> 'email') IN (
      'eric@atoloncartagena.com',
      'direccion@atoloncartagena.com',
      'vsimancas@atoloncartagena.com'
    )
  )
  WITH CHECK (
    lower(auth.jwt() ->> 'email') IN (
      'eric@atoloncartagena.com',
      'direccion@atoloncartagena.com',
      'vsimancas@atoloncartagena.com'
    )
  );

CREATE POLICY "aprobadores_delete_comisiones_semanas" ON public.comisiones_semanas
  FOR DELETE TO authenticated
  USING (
    lower(auth.jwt() ->> 'email') IN (
      'eric@atoloncartagena.com',
      'direccion@atoloncartagena.com',
      'vsimancas@atoloncartagena.com'
    )
  );
