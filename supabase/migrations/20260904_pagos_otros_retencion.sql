-- Retención sobre pagos a embarcaciones (mismo esquema que comisiones)
-- Contexto: al pagar a un comisionista/embarcación externa se descuenta
-- retención en la fuente. El modal MarcarPagadoModal ya soporta este flujo
-- para comisiones (columnas pago_retencion / pago_monto_neto en
-- comisiones_semanas). Ahora lo replicamos para pagos_otros (embarcaciones
-- y gastos generales) para que Andrea pueda registrar la retención al
-- momento del pago.
ALTER TABLE pagos_otros
  ADD COLUMN IF NOT EXISTS retencion numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monto_neto numeric;

COMMENT ON COLUMN pagos_otros.retencion IS
  'Retención aplicada al momento del pago (para embarcaciones/comisionistas). En COP.';
COMMENT ON COLUMN pagos_otros.monto_neto IS
  'Monto efectivamente pagado tras la retención (monto_bruto - retencion).';
