-- Entrada fija Servicio — dirección 2026-07-04:
--   El auto-scheduler siempre pone entrada 07:30. Si hay que cambiar, se
--   hace manual. Razón: el primer grupo puede llegar 7:30am, así que el
--   staff arranca ahí sin importar el primer pasadía del día.
--
-- Se agrega `entrada_fija` que toma precedencia sobre el tier lookup.
-- Los tiers `entrada_por_primer_pasadia` se preservan como referencia
-- (por si se quiere volver a la lógica escalonada).

UPDATE public.staffing_config
SET
  config = jsonb_set(
    config,
    '{turnos_servicio,entrada_fija}',
    '"07:30"'::jsonb,
    true
  ),
  updated_at = now()
WHERE id = 'atolon';
