-- Adjuntar factura real del proveedor a una OC, con desglose IVA y precios
-- reales que actualizan los items y el catálogo de precio_compra.
ALTER TABLE public.ordenes_compra
  ADD COLUMN IF NOT EXISTS factura_subtotal numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS factura_iva      numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS factura_data     jsonb,                  -- raw del parser AI
  ADD COLUMN IF NOT EXISTS factura_aplicada boolean DEFAULT false,  -- ya impactó precios
  ADD COLUMN IF NOT EXISTS factura_aplicada_at timestamptz,
  ADD COLUMN IF NOT EXISTS factura_aplicada_por text;
