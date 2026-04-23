-- Agrega columna loggro_group_id para trackear el grupo en Pirpos/Loggro
-- (un grupo puede contener múltiples órdenes — el group_id nos permite cerrar el tab completo después)

ALTER TABLE hotel_room_service_pedidos
  ADD COLUMN IF NOT EXISTS loggro_group_id text;

CREATE INDEX IF NOT EXISTS idx_room_service_loggro_group
  ON hotel_room_service_pedidos (loggro_group_id)
  WHERE loggro_group_id IS NOT NULL;
