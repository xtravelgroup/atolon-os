-- Agregar loggro_id a rh_empleados para sincronizar con empleados_loggro.
-- Ambas tablas se mantendrán: empleados_loggro es el espejo directo de Loggro
-- (nómina, novedades) y rh_empleados es el maestro operativo de Atolón
-- (horarios, organigrama, posiciones). El loggro_id linkea ambas.

ALTER TABLE public.rh_empleados
  ADD COLUMN IF NOT EXISTS loggro_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rh_empleados_loggro_id
  ON public.rh_empleados(loggro_id) WHERE loggro_id IS NOT NULL;
