-- Boca Chica: marcar llegadas/zarpes que NO cuentan como viaje real.
-- ──────────────────────────────────────────────────────────────────────
-- Las lanchas Atolón a veces están parqueadas en Boca Chica (cerca del
-- hotel). Cuando se mueven entre el muelle y Boca Chica NO consume un
-- viaje real (no usa combustible significativo, no es trayecto a
-- Cartagena), pero el operador igual quiere registrar el movimiento.
--
-- · muelle_llegadas.boca_chica = true → la lancha venía de Boca Chica
-- · muelle_zarpes_flota.boca_chica = true → la lancha va a Boca Chica
--
-- En ambos casos el costo_operativo se debe forzar a 0 y los reportes
-- de viajes (CostosFlotaTab, etc.) los excluyen de los conteos de viajes.

ALTER TABLE muelle_llegadas
  ADD COLUMN IF NOT EXISTS boca_chica boolean NOT NULL DEFAULT false;

ALTER TABLE muelle_zarpes_flota
  ADD COLUMN IF NOT EXISTS boca_chica boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN muelle_llegadas.boca_chica IS
  'TRUE: la lancha venía de Boca Chica (no cuenta como viaje, no consume costo_operativo)';
COMMENT ON COLUMN muelle_zarpes_flota.boca_chica IS
  'TRUE: la lancha va hacia Boca Chica (no cuenta como viaje, no consume costo_operativo)';

-- Índices parciales para consultas rápidas que excluyen Boca Chica
CREATE INDEX IF NOT EXISTS idx_muelle_llegadas_no_bc
  ON muelle_llegadas(fecha) WHERE boca_chica = false;
CREATE INDEX IF NOT EXISTS idx_muelle_zarpes_flota_no_bc
  ON muelle_zarpes_flota(fecha) WHERE boca_chica = false;
