-- Agregar etapa "Duplicado" a leads
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_stage_check;
ALTER TABLE leads ADD CONSTRAINT leads_stage_check
  CHECK (stage IN ('Nuevo','Contactado','Cotizado','Cerrado Ganado','Perdido','Duplicado'));
