-- Audit: agregar columna descuento a eventos y UNIQUE constraint a cierres_caja
-- Fecha: 2026-06-14 · Autorizado por usuario en sesion claude/fase2

-- 1) eventos.descuento — para que TabPagos pueda restar descuentos del saldo organizador.
--    Aditivo, no rompe queries existentes.
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS descuento numeric DEFAULT 0;

-- 2) UNIQUE constraint en cierres_caja(area, fecha::date, cajero_nombre, numero_comprobante)
--    Validado: 0 duplicados con esa key. Hace atomico el check pre-INSERT que pusimos en JS.
--    Usamos una UNIQUE INDEX expression (necesario porque fecha es timestamptz y queremos
--    deduplicar por dia, no por timestamp exacto). NULLs no chocan entre si por default.
CREATE UNIQUE INDEX IF NOT EXISTS cierres_caja_unique_area_fecha_cajero_compr
  ON cierres_caja (area, (fecha::date), cajero_nombre, numero_comprobante)
  WHERE numero_comprobante IS NOT NULL;
