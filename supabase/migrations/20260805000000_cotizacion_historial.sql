-- Historial de cotizaciones rechazadas por la mesa de compras cuando el
-- proveedor cambia condiciones y hay que pedir una nueva.
ALTER TABLE ordenes_compra
  ADD COLUMN IF NOT EXISTS cotizacion_resp_historial jsonb DEFAULT '[]'::jsonb;
NOTIFY pgrst, 'reload schema';
