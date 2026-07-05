-- Vincular vacantes de reclutamiento a posiciones del organigrama.
-- Una vacante puede apuntar a una posición existente (rh_posiciones) o crearse
-- ad-hoc con posicion_id = NULL (nueva posición no formalizada aún).

ALTER TABLE public.rh_vacantes
  ADD COLUMN IF NOT EXISTS posicion_id uuid REFERENCES public.rh_posiciones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rh_vacantes_posicion ON public.rh_vacantes(posicion_id);
