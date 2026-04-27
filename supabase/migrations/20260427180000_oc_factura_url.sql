-- Falta la columna factura_url para guardar el PDF/imagen subida
ALTER TABLE public.ordenes_compra
  ADD COLUMN IF NOT EXISTS factura_url text;
