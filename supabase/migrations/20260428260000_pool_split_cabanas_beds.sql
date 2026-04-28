-- Pool Service: corregir estructura del área de piscina.
-- El usuario aclaró que en el área de piscina hay 10 cabañas + 12 pool beds
-- (suman las 22 camas previas). Son dos categorías distintas:
--   · Cabañas: privadas, con sombra, capacidad 4
--   · Pool Beds: camas al sol, capacidad 2
-- También removemos el área genérica "Cabañas" creada al inicio.

-- 1) Borrar las 22 camas genéricas creadas en la migration previa
DELETE FROM pool_service_areas
WHERE  id LIKE 'AREA-POOL-CAMA-%';

-- 2) Borrar el área genérica "Cabañas" (queda reemplazada por Cabaña 1..10)
DELETE FROM pool_service_areas
WHERE  id = 'AREA-CABANAS';

-- 3) Crear 10 Cabañas individuales (Cabaña 1..10)
INSERT INTO pool_service_areas (id, nombre, zona, tipo, capacidad, qr_code, orden, activo)
SELECT
  'AREA-CABANA-' || lpad(n::text, 2, '0'),
  'Cabaña ' || n,
  'Piscina',
  'cabana',
  4,
  'cabana-' || lpad(n::text, 2, '0'),
  100 + n,                          -- 101..110
  true
FROM generate_series(1, 10) AS n
ON CONFLICT (id) DO NOTHING;

-- 4) Crear 12 Pool Beds individuales (Pool Bed 1..12)
INSERT INTO pool_service_areas (id, nombre, zona, tipo, capacidad, qr_code, orden, activo)
SELECT
  'AREA-POOLBED-' || lpad(n::text, 2, '0'),
  'Pool Bed ' || n,
  'Piscina',
  'piscina',
  2,
  'pool-bed-' || lpad(n::text, 2, '0'),
  200 + n,                          -- 201..212
  true
FROM generate_series(1, 12) AS n
ON CONFLICT (id) DO NOTHING;

-- Verificación
SELECT  tipo,
        COUNT(*) AS cantidad
FROM    pool_service_areas
WHERE   zona = 'Piscina' AND activo = true
GROUP BY tipo
ORDER BY tipo;
