-- Quitar FK nomina_por_dia.empleado_loggro_id → empleados_loggro.
-- Motivo: la columna ahora puede referenciar trabajadores_extra (catalogo
-- separado de personal eventual) o quedar null. Ya no vive solo bajo
-- empleados_loggro. La columna se mantiene como referencia informativa
-- (uuid) sin restriccion.

ALTER TABLE nomina_por_dia
  DROP CONSTRAINT IF EXISTS nomina_por_dia_empleado_loggro_id_fkey;

COMMENT ON COLUMN nomina_por_dia.empleado_loggro_id IS
  'Referencia libre (uuid) al trabajador_extra o empleado_loggro que originó el registro. Sin FK — puede quedar null si el nombre se ingresó manualmente.';
