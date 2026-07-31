-- Muelle: agregar tracking de FE emitida (mismo patron que reservas).
-- Las ventas After Island / Huespedes cobradas en la isla sin reserva previa
-- ahora salen en el reporte Facturacion Diaria y necesitan la accion
-- "Marcar emitida" con numero de factura.

ALTER TABLE muelle_llegadas
  ADD COLUMN IF NOT EXISTS fe_estado text CHECK (fe_estado IN ('pendiente','emitida') OR fe_estado IS NULL),
  ADD COLUMN IF NOT EXISTS fe_numero_factura text,
  ADD COLUMN IF NOT EXISTS fe_emitida_at timestamptz,
  ADD COLUMN IF NOT EXISTS fe_emitida_por text;

COMMENT ON COLUMN muelle_llegadas.fe_estado IS
  'Estado factura electronica: pendiente (default) o emitida. Se marca desde reporte Facturacion Diaria.';
