-- Pool Service: reemplazar áreas genéricas de piscina con 22 camas individuales.
-- Cada cama tiene su propio QR para que el huésped pida desde su lugar.
-- Eliminamos primero las dos áreas genéricas (si no tienen pedidos asociados);
-- si tuvieran pedidos, las inactivamos en su lugar.

-- 1) Inactivar áreas genéricas previas
UPDATE pool_service_areas
SET    activo = false, updated_at = now()
WHERE  id IN ('AREA-PISCINA-PRINCIPAL', 'AREA-PISCINA-CHICA');

-- 2) Borrar las áreas genéricas SOLO si no tienen pedidos asociados
DELETE FROM pool_service_areas
WHERE  id IN ('AREA-PISCINA-PRINCIPAL', 'AREA-PISCINA-CHICA')
  AND  NOT EXISTS (
    SELECT 1 FROM pool_service_pedidos p
    WHERE  p.area_id = pool_service_areas.id
  );

-- 3) Crear 22 camas individuales en la zona de piscina
INSERT INTO pool_service_areas (id, nombre, zona, tipo, capacidad, qr_code, orden, activo)
SELECT
  'AREA-POOL-CAMA-' || lpad(n::text, 2, '0'),
  'Cama ' || n,
  'Piscina',
  'piscina',
  2,                                              -- 2 personas por cama (estándar)
  'pool-cama-' || lpad(n::text, 2, '0'),
  100 + n,                                        -- orden 101..122 (después de las áreas existentes)
  true
FROM generate_series(1, 22) AS n
ON CONFLICT (id) DO NOTHING;

-- Verificación
SELECT  COUNT(*) AS total_camas_piscina
FROM    pool_service_areas
WHERE   zona = 'Piscina' AND tipo = 'piscina' AND activo = true;
