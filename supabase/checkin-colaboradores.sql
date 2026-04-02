-- Add colaboradores JSONB column to salida_despachos
-- Stores crew/staff per salida per fecha for zarpe document
-- Format: [{nombre: text, cedula: text, rol: text}]

ALTER TABLE salida_despachos
  ADD COLUMN IF NOT EXISTS colaboradores jsonb DEFAULT '[]'::jsonb;

-- Allow null despachado_at so despacho records can be created
-- just to store colaboradores even before the boat is dispatched
ALTER TABLE salida_despachos
  ALTER COLUMN despachado_at DROP NOT NULL;
