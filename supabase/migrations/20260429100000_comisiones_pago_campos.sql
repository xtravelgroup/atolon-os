-- Comisiones: agregar campos para registrar el pago real
-- (referencia, método, cuenta origen y comprobante).
-- Antes solo había aprobado_at/ejecutado_at sin metadatos del pago.

ALTER TABLE comisiones_semanas
  ADD COLUMN IF NOT EXISTS pago_referencia       text,
  ADD COLUMN IF NOT EXISTS pago_metodo           text,
  ADD COLUMN IF NOT EXISTS pago_cuenta_origen    text,
  ADD COLUMN IF NOT EXISTS pago_comprobante_url  text;

COMMENT ON COLUMN comisiones_semanas.pago_referencia      IS 'Nº de transferencia / cheque / Zelle del pago de la comisión';
COMMENT ON COLUMN comisiones_semanas.pago_metodo          IS 'transferencia | cheque | efectivo | zelle | tarjeta | otro';
COMMENT ON COLUMN comisiones_semanas.pago_cuenta_origen   IS 'Cuenta bancaria desde la que se pagó';
COMMENT ON COLUMN comisiones_semanas.pago_comprobante_url IS 'URL del comprobante (foto/PDF) en bucket comprobantes';
