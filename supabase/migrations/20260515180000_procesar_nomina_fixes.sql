-- Procesar Nómina — desbloquear el guardado de la nómina quincenal consolidada.
--
-- 3 bloqueos que impedían que "Procesar Nómina" guardara:
--  1. nomina_por_dia.total era GENERATED ALWAYS → ProcesarNomina escribe el
--     neto real (devengado − deducciones), Postgres rechazaba el write.
--  2. El upsert usa onConflict (fecha, empleado_loggro_id) pero no existía
--     constraint UNIQUE → "no unique or exclusion constraint" al guardar.
--  3. empleados_loggro_novedades.empleado_loggro_id apuntaba (FK) a
--     empleados_loggro, pero ProcesarNomina usa rh_empleados como fuente
--     (con tarifa_hora). Las novedades manuales fallaban el FK.
--
-- nomina_por_dia y empleados_loggro_novedades están vacías → migración segura.

-- 1) total deja de ser columna calculada (la nómina consolidada guarda el neto)
ALTER TABLE nomina_por_dia ALTER COLUMN total DROP EXPRESSION IF EXISTS;
ALTER TABLE nomina_por_dia ALTER COLUMN total SET DEFAULT 0;

-- 2) deducciones explícitas para trazabilidad (neto = devengado − deducciones)
ALTER TABLE nomina_por_dia ADD COLUMN IF NOT EXISTS deducciones numeric DEFAULT 0;

-- 3) UNIQUE para el upsert 1-fila-por-empleado-por-período
ALTER TABLE nomina_por_dia
  DROP CONSTRAINT IF EXISTS nomina_por_dia_fecha_emp_uniq;
ALTER TABLE nomina_por_dia
  ADD CONSTRAINT nomina_por_dia_fecha_emp_uniq UNIQUE (fecha, empleado_loggro_id);

-- 4) novedades referencian rh_empleados (la fuente real de Procesar Nómina)
ALTER TABLE empleados_loggro_novedades
  DROP CONSTRAINT IF EXISTS empleados_loggro_novedades_empleado_loggro_id_fkey;
ALTER TABLE empleados_loggro_novedades
  ADD CONSTRAINT empleados_loggro_novedades_empleado_fkey
  FOREIGN KEY (empleado_loggro_id) REFERENCES rh_empleados(id) ON DELETE CASCADE;
