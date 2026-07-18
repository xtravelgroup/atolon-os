-- ============================================================
-- Inventario inicial del 15/jul 2026
-- Direccion 2026-07-18: el inventario real de Atolon OS empieza el
-- 15/jul con el conteo físico que Meris cargó como "Entrada Ajuste"
-- en Loggro. Todo lo anterior queda como snapshot en items_stock_snapshot
-- (para auditoría forense) pero NO se usa como stock operativo.
-- ============================================================

-- 1) Almacén General para items con categoría ambigua
INSERT INTO items_locaciones (id, nombre, icono, es_recepcion, activa) VALUES
  ('LOC-ALMACEN-GENERAL', 'Almacén General', '📦', true, true)
ON CONFLICT (id) DO NOTHING;

-- 2) Clasificación por categoría atolón (más confiable que raw.category de Loggro)
UPDATE items_catalogo SET locacion_default_id = 'LOC-ALMACEN-BAR', updated_at = NOW()
WHERE activo=true
  AND categoria ~* '\y(BEBIDA|COCKTAIL|CERVEZA|BOTELLA|WHISKY|BOURBON|VODKA|GIN|RON|TEQUILA|MEZCAL|VINO|ESPUMOSO|SHOT|JUGO|MINIBAR|BAR|AGUARDIENTE|LICOR|COGNAC|SPIRIT|WELCOME|Bebidas)\y';

UPDATE items_catalogo SET locacion_default_id = 'LOC-ALMACEN-GENERAL', updated_at = NOW()
WHERE activo=true AND categoria = 'Otros';

UPDATE items_catalogo SET locacion_default_id = 'LOC-ALMACEN-COCINA', updated_at = NOW()
WHERE activo=true AND locacion_default_id IS NULL;

-- 3) Snapshot histórico pre-15/jul (auditoría forense)
CREATE TABLE IF NOT EXISTS items_stock_snapshot (
  id            bigserial PRIMARY KEY,
  fecha_corte   date NOT NULL,
  item_id       text NOT NULL,
  item_nombre   text,
  locacion_id   text,
  cantidad      numeric NOT NULL,
  unidad        text,
  motivo        text NOT NULL,
  fecha_creacion timestamptz DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_snap_fecha ON items_stock_snapshot(fecha_corte);
CREATE INDEX IF NOT EXISTS idx_snap_item ON items_stock_snapshot(item_id, fecha_corte);
ALTER TABLE items_stock_snapshot ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_all_snap ON items_stock_snapshot;
CREATE POLICY auth_all_snap ON items_stock_snapshot FOR ALL USING (auth.role()='authenticated') WITH CHECK (auth.role()='authenticated');

-- Poblar el snapshot: reconstruir stock saldo por saldo desde movimientos históricos
-- hasta la fecha del reset (15/jul). Excluye el ajuste inicial del 15/jul mismo.
INSERT INTO items_stock_snapshot (fecha_corte, item_id, item_nombre, locacion_id, cantidad, unidad, motivo)
SELECT
  '2026-07-15'::date,
  m.item_id, ic.nombre, m.almacen_id,
  SUM(CASE WHEN m.tipo LIKE 'entrada%' THEN m.cantidad ELSE -m.cantidad END),
  MAX(m.unidad),
  'Reconstruido por saldo de movimientos_inventario_atolon previo al reset 2026-07-15. Uso: auditoria forense.'
FROM movimientos_inventario_atolon m
LEFT JOIN items_catalogo ic ON ic.id = m.item_id
WHERE m.anulado = false
  AND m.fecha < '2026-07-15'::date
  AND m.origen_tipo != 'inventario_fisico_loggro'
GROUP BY m.item_id, ic.nombre, m.almacen_id
HAVING SUM(CASE WHEN m.tipo LIKE 'entrada%' THEN m.cantidad ELSE -m.cantidad END) != 0;

-- ============================================================
-- El inventario del 15/jul se aplica via script node
-- (scripts/inv-inicial-15jul.mjs) que:
--   1. Lee /inventories?type=3 de Loggro (Entrada-Ajuste) del 15/jul
--   2. Mapea cada loggro_id -> items_catalogo.id
--   3. Setea items_stock_locacion.cantidad = valor Loggro en el
--      locacion_default_id del item
--   4. Registra 'entrada_ajuste' en movimientos_inventario_atolon
--   5. Recalcula items_catalogo.stock_actual = SUM
--
-- Verificación:
--   SELECT locacion_default_id, COUNT(*) FROM items_catalogo
--   WHERE activo=true GROUP BY locacion_default_id;
--   → LOC-ALMACEN-COCINA: 339
--   → LOC-ALMACEN-BAR:    314
--   → LOC-ALMACEN-GENERAL: 157
-- ============================================================
