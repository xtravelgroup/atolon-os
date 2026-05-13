-- contratistas: agregar columnas fecha_aprobacion y fecha_rechazo que la
-- edge function contratistas-change-state intenta escribir pero nunca se
-- crearon. Sin esto, el UPDATE fallaba silenciosamente y el contratista
-- nunca pasaba a estado "aprobado" en la DB → no aparecía en el tab
-- "Aprobados" del módulo admin.

ALTER TABLE contratistas
  ADD COLUMN IF NOT EXISTS fecha_aprobacion timestamptz,
  ADD COLUMN IF NOT EXISTS fecha_rechazo    timestamptz;

CREATE INDEX IF NOT EXISTS idx_contratistas_fecha_aprobacion
  ON contratistas(fecha_aprobacion DESC) WHERE fecha_aprobacion IS NOT NULL;

NOTIFY pgrst, 'reload schema';
