-- Regla: tarifa_hora SIEMPRE = salario_base / 190.6667 (95.3333 h/quincena × 2),
-- la misma base legal que usa la nómina. Se aplica a todos los empleados
-- actuales y a los que se vayan creando/editando, sin depender del frontend.

CREATE OR REPLACE FUNCTION rh_empleados_set_tarifa_hora()
RETURNS trigger AS $$
BEGIN
  NEW.tarifa_hora := ROUND(COALESCE(NEW.salario_base, 0) / 190.66666667);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rh_empleados_tarifa_hora ON rh_empleados;
CREATE TRIGGER trg_rh_empleados_tarifa_hora
  BEFORE INSERT OR UPDATE ON rh_empleados
  FOR EACH ROW EXECUTE FUNCTION rh_empleados_set_tarifa_hora();

-- Backfill de los empleados existentes (dispara el trigger).
UPDATE rh_empleados
SET tarifa_hora = ROUND(COALESCE(salario_base, 0) / 190.66666667)
WHERE salario_base IS NOT NULL;
