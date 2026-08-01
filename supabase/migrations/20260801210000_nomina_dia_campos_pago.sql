-- Nomina por dia: agregar campos de trazabilidad del pago.
-- El pago YA NO se marca manualmente desde 'Nomina por Dia' — ahora fluye
-- desde el modulo Pagos → MarcarPagadoModal cuando el admin marca como
-- pagado, guarda referencia + comprobante + fecha real.

ALTER TABLE nomina_por_dia
  ADD COLUMN IF NOT EXISTS pagado_at timestamptz,
  ADD COLUMN IF NOT EXISTS pagado_por text,
  ADD COLUMN IF NOT EXISTS referencia_pago text,
  ADD COLUMN IF NOT EXISTS cuenta_origen text;

COMMENT ON COLUMN nomina_por_dia.pagado_at IS
  'Fecha real del pago. Se llena desde el modulo Pagos al confirmar.';
COMMENT ON COLUMN nomina_por_dia.referencia_pago IS
  'Referencia bancaria del pago (TRX, cheque, etc.)';
