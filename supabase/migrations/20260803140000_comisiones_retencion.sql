-- Retención aplicada al pagar una comisión (para reflejar el neto real)
ALTER TABLE comisiones_semanas
  ADD COLUMN IF NOT EXISTS pago_retencion numeric,
  ADD COLUMN IF NOT EXISTS pago_monto_neto numeric;
