-- ═══════════════════════════════════════════════════════════════════
-- CIERRE DE CAJA v2 — Nuevas columnas para áreas, cajero y métodos
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE cierres_caja
  ADD COLUMN IF NOT EXISTS area                text,
  ADD COLUMN IF NOT EXISTS cajero_nombre       text,
  ADD COLUMN IF NOT EXISTS numero_caja         text,
  ADD COLUMN IF NOT EXISTS numero_comprobante  text,
  ADD COLUMN IF NOT EXISTS comprobante_url     text,
  ADD COLUMN IF NOT EXISTS metodos             jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS total_ventas        integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_propinas      integer DEFAULT 0;

-- Índice por área y fecha para reportes
CREATE INDEX IF NOT EXISTS idx_cierres_area_fecha ON cierres_caja(area, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_cierres_cajero     ON cierres_caja(cajero_nombre);
