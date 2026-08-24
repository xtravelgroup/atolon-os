-- ═══════════════════════════════════════════════════════════════════════
-- Cuenta de cobro para embarcacion_solicitudes
-- ═══════════════════════════════════════════════════════════════════════
-- Cuando el servicio está completado, operaciones/contabilidad registra la
-- cuenta de cobro (o factura) del proveedor externo. Automáticamente crea
-- un registro en pagos_otros con pagado=false → aparece en Por Pagar.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE embarcacion_solicitudes
  ADD COLUMN IF NOT EXISTS cuenta_cobro_numero    text,
  ADD COLUMN IF NOT EXISTS cuenta_cobro_fecha     date,
  ADD COLUMN IF NOT EXISTS cuenta_cobro_vencimiento date,
  ADD COLUMN IF NOT EXISTS factura_url            text,
  ADD COLUMN IF NOT EXISTS pago_id                text,
  ADD COLUMN IF NOT EXISTS registrada_pago_at     timestamptz;

CREATE INDEX IF NOT EXISTS idx_es_pago_id ON embarcacion_solicitudes(pago_id) WHERE pago_id IS NOT NULL;
