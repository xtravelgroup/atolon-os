-- Duración del almuerzo por empleado (descuento por día trabajado en nómina).
-- 1 = 1 hora, 0.5 = media hora. Se resta de las horas trabajadas del día.
ALTER TABLE rh_empleados
  ADD COLUMN IF NOT EXISTS almuerzo_horas numeric DEFAULT 1;
