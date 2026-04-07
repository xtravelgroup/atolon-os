-- Modalidad de pago para grupos
-- "individual"  → cada invitado entra al link y paga su propio cupo (default)
-- "organizador" → el organizador paga todos los cupos con un link Wompi único

ALTER TABLE eventos
  ADD COLUMN IF NOT EXISTS modalidad_pago text DEFAULT 'individual';
