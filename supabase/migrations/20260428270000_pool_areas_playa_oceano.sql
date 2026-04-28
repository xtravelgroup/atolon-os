-- Pool Service: ajustar áreas exteriores a la realidad de Atolón.
-- Solo existen 2 áreas fuera de la piscina: Área Playa y Área Océano.
-- Eliminar las áreas que se crearon por suposición:
--   · Beach Norte / Beach Sur (no existen como tales)
--   · Bar Central (el bar no usa Pool Service)
--   · VIP Lounge (no existe como zona separada)

-- 1) Borrar áreas inexistentes (solo si no tienen pedidos)
DELETE FROM pool_service_areas
WHERE  id IN ('AREA-BEACH-NORTE', 'AREA-BEACH-SUR', 'AREA-BAR-CENTRAL', 'AREA-VIP')
  AND  NOT EXISTS (
    SELECT 1 FROM pool_service_pedidos p WHERE p.area_id = pool_service_areas.id
  );

-- 2) Inactivar las que tuvieran pedidos (preserva integridad)
UPDATE pool_service_areas
SET    activo = false, updated_at = now()
WHERE  id IN ('AREA-BEACH-NORTE', 'AREA-BEACH-SUR', 'AREA-BAR-CENTRAL', 'AREA-VIP');

-- 3) Crear las 3 zonas generales (Piscina catch-all, Playa, Océano)
-- Nota: Área Piscina es catch-all para huéspedes que NO están en una
-- cabaña/pool bed específica (caminando, en el agua, etc.)
INSERT INTO pool_service_areas (id, nombre, zona, tipo, capacidad, qr_code, orden, activo) VALUES
  ('AREA-PISCINA', 'Área Piscina', 'Piscina', 'piscina', 0, 'area-piscina', 290, true),
  ('AREA-PLAYA',   'Área Playa',   'Playa',   'beach',   0, 'area-playa',   300, true),
  ('AREA-OCEANO',  'Área Océano',  'Océano',  'beach',   0, 'area-oceano',  310, true)
ON CONFLICT (id) DO UPDATE
  SET nombre    = EXCLUDED.nombre,
      zona      = EXCLUDED.zona,
      tipo      = EXCLUDED.tipo,
      qr_code   = EXCLUDED.qr_code,
      orden     = EXCLUDED.orden,
      activo    = true,
      updated_at = now();

-- Verificación
SELECT id, nombre, zona, qr_code, capacidad
FROM   pool_service_areas
WHERE  activo = true
ORDER BY orden;
