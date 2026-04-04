-- Actualizar precio_neto y precio_publico en reservas B2B manuales basado en tipo
UPDATE reservas SET
  precio_neto   = 250000,
  precio_publico = 320000
WHERE aliado_id IS NOT NULL AND tipo ILIKE 'VIP Pass' AND precio_neto = 0;

UPDATE reservas SET
  precio_neto   = 500000,
  precio_publico = 590000
WHERE aliado_id IS NOT NULL AND tipo ILIKE 'EXCLUSIVE PASS' AND precio_neto = 0;

UPDATE reservas SET
  precio_neto   = 150000,
  precio_publico = 170000
WHERE aliado_id IS NOT NULL AND tipo ILIKE 'After Island' AND precio_neto = 0;

UPDATE reservas SET
  precio_neto   = 1000000,
  precio_publico = 1100000
WHERE aliado_id IS NOT NULL AND tipo ILIKE 'ATOLON EXPERIENCE' AND precio_neto = 0;
