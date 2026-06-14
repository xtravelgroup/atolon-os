-- Múltiples facturas independientes por OC.
-- Antes: una sola factura por OC en columnas singulares de ordenes_compra
-- (factura_numero, factura_subtotal, factura_iva, factura_data, ...).
-- Ahora: cada factura es una fila en oc_facturas. Las columnas factura_*
-- de ordenes_compra se MANTIENEN como espejo de la última factura aplicada
-- + agregado (SUM), para compat con CxP / pagos / listados existentes.

CREATE TABLE IF NOT EXISTS oc_facturas (
  id                     text PRIMARY KEY,
  oc_id                  uuid NOT NULL REFERENCES ordenes_compra(id) ON DELETE CASCADE,
  oc_codigo              text,
  factura_numero         text NOT NULL,
  factura_fecha          date,
  fecha_vencimiento_pago date,
  forma_pago             text,
  subtotal               numeric DEFAULT 0,   -- subtotal_base de ESTA factura
  iva                    numeric DEFAULT 0,
  consumo                numeric DEFAULT 0,
  total                  numeric DEFAULT 0,
  factura_data           jsonb,               -- output del parser de ESTA factura (solo sus items)
  factura_url            text,
  aplicada               boolean DEFAULT false,
  aplicada_at            timestamptz,
  aplicada_por           text,
  monto_pagado           numeric DEFAULT 0,   -- reservado: pagos por-factura (futuro)
  pagada_completa        boolean DEFAULT false,
  created_at             timestamptz DEFAULT now(),
  created_by             text
);

CREATE INDEX IF NOT EXISTS idx_oc_facturas_oc ON oc_facturas(oc_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_oc_facturas_oc_num
  ON oc_facturas(oc_id, factura_numero);

-- RLS permisivo (igual que cxp_pagos / resto del esquema operativo)
ALTER TABLE oc_facturas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oc_facturas_all ON oc_facturas;
CREATE POLICY oc_facturas_all ON oc_facturas FOR ALL USING (true) WITH CHECK (true);

-- Backfill: una fila por cada OC que ya tiene factura singular aplicada o adjunta.
INSERT INTO oc_facturas (
  id, oc_id, oc_codigo, factura_numero, factura_fecha, fecha_vencimiento_pago,
  subtotal, iva, total, factura_data, factura_url,
  aplicada, aplicada_at, aplicada_por, monto_pagado, pagada_completa, created_at, created_by)
SELECT
  'OCF_' || replace(id::text, '-', '') || '_legacy',
  id, codigo,
  COALESCE(NULLIF(factura_numero, ''), 'SIN-NUMERO'),
  factura_fecha, fecha_vencimiento_pago,
  COALESCE(factura_subtotal, 0), COALESCE(factura_iva, 0), COALESCE(total, 0),
  factura_data, factura_url,
  COALESCE(factura_aplicada, false), factura_aplicada_at, factura_aplicada_por,
  COALESCE(monto_pagado, 0), COALESCE(pagada_completa, false),
  COALESCE(factura_aplicada_at, created_at, now()), factura_aplicada_por
FROM ordenes_compra
WHERE factura_aplicada = true OR factura_url IS NOT NULL
ON CONFLICT (oc_id, factura_numero) DO NOTHING;

NOTIFY pgrst, 'reload schema';
