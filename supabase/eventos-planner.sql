-- Nuevas columnas para Event Planner
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS timeline_items         jsonb DEFAULT '[]';
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS contactos_rapidos      jsonb DEFAULT '[]';
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS transporte_detalle     jsonb DEFAULT '[]';
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS incidentes             jsonb DEFAULT '[]';
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS restricciones_dieteticas jsonb DEFAULT '[]';
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS servicios_contratados  jsonb DEFAULT '[]';
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS notas_operativas       text;
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS responsable_evento     text;
