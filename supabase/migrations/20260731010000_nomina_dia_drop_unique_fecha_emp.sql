-- Quitar UNIQUE (fecha, empleado_loggro_id) de nomina_por_dia.
-- Motivo: con el flujo solicitud→aprobación→ejecución, un mismo trabajador
-- puede tener múltiples registros el mismo día:
--   - 2 turnos partidos que se registran por separado
--   - solicitud rechazada + nueva solicitud del mismo día
--   - 2 supervisores solicitando al mismo trabajador para eventos distintos
-- Ninguno es un duplicado real. La app puede validar en UI si aplica.

ALTER TABLE nomina_por_dia
  DROP CONSTRAINT IF EXISTS nomina_por_dia_fecha_emp_uniq;
