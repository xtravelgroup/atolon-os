-- ============================================================
-- BACKFILL histórico → movimientos_inventario_atolon
-- Fase 3 del proyecto Inventario/Almacenes.
-- Corrido una vez el 2026-07-18. Idempotente: NOT EXISTS por
-- (origen_tipo, origen_id) permite re-correr sin duplicar.
-- ============================================================

-- 1) COMEDOR: comedor_consumo → salida_comedor
INSERT INTO movimientos_inventario_atolon
  (id, tipo, item_id, cantidad, unidad, precio_unit, origen_tipo, origen_id, fecha, usuario_email, notas)
SELECT
  'MOV-CM-' || cc.id, 'salida_comedor', cc.item_id, cc.cantidad, cc.unidad,
  COALESCE(cc.precio_unitario, 0), 'comedor_consumo', cc.id::text, cc.fecha,
  cc.registrado_por, 'Comedor ' || cc.comida || COALESCE(' — ' || cc.notas, '')
FROM comedor_consumo cc
WHERE cc.anulado = false
  AND NOT EXISTS (
    SELECT 1 FROM movimientos_inventario_atolon m
    WHERE m.origen_tipo = 'comedor_consumo' AND m.origen_id = cc.id::text
  );

-- 2) EVENTOS: eventos_consumo_openbar → salida_evento
INSERT INTO movimientos_inventario_atolon
  (id, tipo, item_id, cantidad, unidad, precio_unit, origen_tipo, origen_id, fecha, usuario_email, notas)
SELECT
  'MOV-EV-' || ec.id, 'salida_evento', ec.item_id, ec.cantidad, ec.unidad,
  COALESCE(ec.precio_unitario, 0), 'eventos_consumo_openbar', ec.id::text,
  COALESCE(ec.created_at, NOW()), ec.registrado_por,
  'Evento ' || COALESCE(ec.tipo, '') || COALESCE(' — ' || ec.notas, '')
FROM eventos_consumo_openbar ec
WHERE ec.anulado = false
  AND NOT EXISTS (
    SELECT 1 FROM movimientos_inventario_atolon m
    WHERE m.origen_tipo = 'eventos_consumo_openbar' AND m.origen_id = ec.id::text
  );

-- 3) OCs RECIBIDAS via item_id (items linkeados al catalogo)
INSERT INTO movimientos_inventario_atolon
  (id, tipo, item_id, cantidad, unidad, precio_unit, origen_tipo, origen_id, fecha, usuario_email, notas)
SELECT
  'MOV-OC-' || substr(oc.id::text, 1, 8) || '-' || (item->>'item_id'),
  'entrada_compra', item->>'item_id',
  NULLIF(item->>'cant', '')::numeric, item->>'unidad',
  COALESCE(NULLIF(item->>'precioU', '')::numeric, NULLIF(item->>'precio_unit', '')::numeric, 0),
  'ordenes_compra', oc.id::text,
  COALESCE(oc.recibida_at, oc.fecha_recepcion, oc.created_at, NOW()),
  COALESCE(oc.recibida_por, 'backfill'),
  'Recepción OC — ' || (item->>'item')
FROM ordenes_compra oc, jsonb_array_elements(oc.items) AS item
WHERE oc.estado = 'recibida' AND jsonb_typeof(oc.items) = 'array'
  AND (item->>'item_id') IS NOT NULL
  AND (item->>'cant') IS NOT NULL AND (item->>'cant') <> ''
  AND NULLIF(item->>'cant', '')::numeric > 0
  AND EXISTS (SELECT 1 FROM items_catalogo ic WHERE ic.id = item->>'item_id')
  AND NOT EXISTS (
    SELECT 1 FROM movimientos_inventario_atolon m
    WHERE m.origen_tipo = 'ordenes_compra'
      AND m.origen_id = oc.id::text AND m.item_id = item->>'item_id'
  );

-- 4) OCs RECIBIDAS via match por NOMBRE (items sin item_id explicito)
INSERT INTO movimientos_inventario_atolon
  (id, tipo, item_id, cantidad, unidad, precio_unit, origen_tipo, origen_id, fecha, usuario_email, notas)
SELECT
  'MOV-OC-' || substr(oc.id::text, 1, 8) || '-' || ic.id,
  'entrada_compra', ic.id,
  NULLIF(item->>'cant', '')::numeric, item->>'unidad',
  COALESCE(NULLIF(item->>'precioU', '')::numeric, NULLIF(item->>'precio_unit', '')::numeric, 0),
  'ordenes_compra', oc.id::text,
  COALESCE(oc.recibida_at, oc.fecha_recepcion, oc.created_at, NOW()),
  COALESCE(oc.recibida_por, 'backfill'),
  'Recepción OC — ' || (item->>'item') || ' (match nombre)'
FROM ordenes_compra oc, jsonb_array_elements(oc.items) AS item, items_catalogo ic
WHERE oc.estado = 'recibida' AND jsonb_typeof(oc.items) = 'array'
  AND (item->>'item_id') IS NULL
  AND (item->>'cant') IS NOT NULL AND (item->>'cant') <> ''
  AND NULLIF(item->>'cant', '')::numeric > 0
  AND lower(trim(ic.nombre)) = lower(trim(item->>'item'))
  AND NOT EXISTS (
    SELECT 1 FROM movimientos_inventario_atolon m
    WHERE m.origen_tipo = 'ordenes_compra'
      AND m.origen_id = oc.id::text AND m.item_id = ic.id
  );

SELECT tipo, COUNT(*) AS n FROM movimientos_inventario_atolon GROUP BY tipo ORDER BY n DESC;
