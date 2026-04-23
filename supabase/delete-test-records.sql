-- Delete test reservas and leads
-- Matches any record where nombre or email contains "test" (case-insensitive)

DELETE FROM reservas
WHERE lower(nombre) LIKE '%test%'
   OR lower(email)  LIKE '%test%';

DELETE FROM leads
WHERE lower(nombre) LIKE '%test%'
   OR lower(email)  LIKE '%test%';
