-- Guardar el mesero que toma cada pedido de Pool Service, además del nombre
-- ya almacenado en creado_por (que también sirve para trazabilidad histórica).
-- El id apunta a empleados_loggro.id — con eso podemos re-resolver loggro_id
-- (ObjectId POS) para reenvíos o reportes por mesero.

ALTER TABLE public.pool_service_pedidos
  ADD COLUMN IF NOT EXISTS mesero_id text;

CREATE INDEX IF NOT EXISTS idx_pool_service_pedidos_mesero
  ON public.pool_service_pedidos(mesero_id) WHERE mesero_id IS NOT NULL;
