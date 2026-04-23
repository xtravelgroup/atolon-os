-- RLS requisiciones / ordenes_compra / reglas_aprobacion — authenticated full access
-- Reportado: órdenes creadas no aparecen en Aprobaciones (RLS bloquea SELECT anon,
-- y la UI usa la sesión autenticada pero aparentemente también le bloqueaban ops).

ALTER TABLE public.requisiciones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_compra   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_requisiciones" ON public.requisiciones;
CREATE POLICY "auth_all_requisiciones" ON public.requisiciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_ordenes_compra" ON public.ordenes_compra;
CREATE POLICY "auth_all_ordenes_compra" ON public.ordenes_compra
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Reglas de aprobación (si la tabla existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='reglas_aprobacion') THEN
    EXECUTE 'ALTER TABLE public.reglas_aprobacion ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "auth_all_reglas_aprobacion" ON public.reglas_aprobacion';
    EXECUTE 'CREATE POLICY "auth_all_reglas_aprobacion" ON public.reglas_aprobacion FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;
