-- Trackear sincronización de cada consumo con Loggro (Salida - Otro).
-- ──────────────────────────────────────────────────────────────────
-- Cuando se registra un consumo de evento, además de descontar del
-- inventario local, debemos crear un movimiento "Salida - Otro" en
-- Loggro para que el inventario contable también refleje la salida.
--
-- Flujo:
--   1. Insert en eventos_consumo_openbar (loggro_sync_status='pendiente')
--   2. Frontend invoca /functions/v1/loggro-sync/consumo-evento-salida
--   3. Edge function crea movimiento en Loggro y guarda movement_id
--   4. Si falla → status='error' con mensaje, queda visible para retry

ALTER TABLE eventos_consumo_openbar
  ADD COLUMN IF NOT EXISTS loggro_sync_status text DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS loggro_movement_id text,
  ADD COLUMN IF NOT EXISTS loggro_sync_error  text,
  ADD COLUMN IF NOT EXISTS loggro_sync_at     timestamptz;

CREATE INDEX IF NOT EXISTS idx_consumo_loggro_pendientes
  ON eventos_consumo_openbar(loggro_sync_status)
  WHERE anulado = false AND loggro_sync_status IN ('pendiente', 'error');

NOTIFY pgrst, 'reload schema';
