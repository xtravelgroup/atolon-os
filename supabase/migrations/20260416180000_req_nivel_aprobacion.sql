-- Nivel de aprobación para requisiciones
ALTER TABLE requisiciones ADD COLUMN IF NOT EXISTS nivel_aprobacion text DEFAULT 'gerente_general';
-- gerente_general = solo necesita gerente
-- direccion = necesita gerente + dirección

-- Tracking de aprobaciones parciales
ALTER TABLE requisiciones ADD COLUMN IF NOT EXISTS aprobaciones jsonb DEFAULT '[]';
-- [{quien, rol, fecha, accion: "aprobada"|"rechazada"}]
