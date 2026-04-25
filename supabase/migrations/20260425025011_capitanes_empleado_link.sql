-- Capitanes nómina: vincular con rh_empleados (la fuente de verdad de personas)
ALTER TABLE public.capitanes_flota
  ADD COLUMN IF NOT EXISTS empleado_id uuid REFERENCES public.rh_empleados(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_capitanes_empleado ON public.capitanes_flota(empleado_id);
