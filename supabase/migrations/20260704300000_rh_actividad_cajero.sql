-- Nueva actividad 'Cajero' para auto-scheduler (Fase 4 Horarios).
-- El rol Cajero fue agregado a staffing_config el 2026-07-04.

INSERT INTO public.rh_actividades (nombre, color, icono, orden, activo)
SELECT 'Cajero', '#eab308', '💰', 16, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.rh_actividades WHERE nombre = 'Cajero'
);
