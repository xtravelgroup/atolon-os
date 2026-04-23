-- Expandir tipos permitidos en aliados_b2b: Hotel, Agencia, Empresa, Freelance, Event Planner, Revendedor
ALTER TABLE aliados_b2b DROP CONSTRAINT IF EXISTS aliados_b2b_tipo_check;
ALTER TABLE aliados_b2b ADD CONSTRAINT aliados_b2b_tipo_check
  CHECK (tipo IN ('Hotel','Agencia','Empresa','Freelance','Event Planner','Revendedor'));
