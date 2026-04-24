-- RLS salidas + tablas relacionadas — authenticated puede leer/escribir
-- Reportado: al generar el doc "Reservas MAÑANA" todas las reservas caen en
-- "Sin salida asignada" porque el array salidas viene vacío (RLS bloquea).

ALTER TABLE public.salidas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_salidas" ON public.salidas;
DROP POLICY IF EXISTS "anon_select_salidas" ON public.salidas;

CREATE POLICY "auth_all_salidas"   ON public.salidas FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_select_salidas" ON public.salidas FOR SELECT TO anon USING (true);

-- Asegurar también en salidas_override y cierres_pasadias (si existen)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='salidas_override') THEN
    EXECUTE 'ALTER TABLE public.salidas_override ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "auth_all_salidas_override" ON public.salidas_override';
    EXECUTE 'CREATE POLICY "auth_all_salidas_override" ON public.salidas_override FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='cierres_pasadias') THEN
    EXECUTE 'ALTER TABLE public.cierres_pasadias ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "auth_all_cierres_pasadias" ON public.cierres_pasadias';
    EXECUTE 'CREATE POLICY "auth_all_cierres_pasadias" ON public.cierres_pasadias FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;
