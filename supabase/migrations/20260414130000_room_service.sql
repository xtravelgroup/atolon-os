-- Room Service: flag on menu_items + pedidos table
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS room_service boolean DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_menu_items_room_service ON menu_items(room_service) WHERE room_service = true;

CREATE TABLE IF NOT EXISTS hotel_room_service_pedidos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo          text UNIQUE,
  habitacion_id   uuid REFERENCES hotel_habitaciones(id) ON DELETE SET NULL,
  habitacion_num  text,
  huesped         text DEFAULT '',
  items           jsonb DEFAULT '[]'::jsonb, -- [{ id, nombre, cantidad, precio, notas }]
  subtotal        numeric DEFAULT 0,
  total           numeric DEFAULT 0,
  notas           text DEFAULT '',
  estado          text DEFAULT 'pendiente', -- pendiente | enviado_loggro | preparando | entregado | cancelado
  creado_por      text DEFAULT '',
  enviado_loggro_at  timestamptz,
  loggro_response    jsonb,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rs_pedidos_habitacion ON hotel_room_service_pedidos(habitacion_id);
CREATE INDEX IF NOT EXISTS idx_rs_pedidos_estado ON hotel_room_service_pedidos(estado);
CREATE INDEX IF NOT EXISTS idx_rs_pedidos_created ON hotel_room_service_pedidos(created_at DESC);

ALTER TABLE hotel_room_service_pedidos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rs_pedidos_all" ON hotel_room_service_pedidos;
CREATE POLICY "rs_pedidos_all" ON hotel_room_service_pedidos FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON hotel_room_service_pedidos TO anon, authenticated;
