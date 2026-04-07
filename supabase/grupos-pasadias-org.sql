-- Pasadías múltiples por grupo (modo organizador)
-- Array de objetos: [{ id, tipo, personas }]

ALTER TABLE eventos
  ADD COLUMN IF NOT EXISTS pasadias_org jsonb DEFAULT '[]';
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS precio_tipo text DEFAULT 'publico';
