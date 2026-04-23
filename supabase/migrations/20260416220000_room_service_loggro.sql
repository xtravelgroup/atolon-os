-- Campos para tracking de envío a Loggro
ALTER TABLE hotel_room_service_pedidos ADD COLUMN IF NOT EXISTS enviado_loggro_at timestamptz;
ALTER TABLE hotel_room_service_pedidos ADD COLUMN IF NOT EXISTS loggro_order_id text;
ALTER TABLE hotel_room_service_pedidos ADD COLUMN IF NOT EXISTS loggro_response jsonb;
