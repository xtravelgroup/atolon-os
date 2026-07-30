-- Soporte de turno partido en rh_marcaciones (2 bloques por día máximo).
-- Restobar/hotel: típico 08:00-12:00 + 15:00-19:00. Mayoría de empleados
-- tiene 1 solo bloque; solo cuando hay 2 se llenan entrada_2/salida_2.

ALTER TABLE rh_marcaciones
  ADD COLUMN IF NOT EXISTS entrada_2 time without time zone,
  ADD COLUMN IF NOT EXISTS salida_2  time without time zone;

COMMENT ON COLUMN rh_marcaciones.entrada_2 IS
  'Entrada del 2do bloque (turno partido). NULL si turno continuo.';
COMMENT ON COLUMN rh_marcaciones.salida_2 IS
  'Salida del 2do bloque (turno partido). NULL si turno continuo.';
