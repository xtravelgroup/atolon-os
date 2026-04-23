-- ─────────────────────────────────────────────────────────────────────────────
-- SPRINT 1: Guest portal + estancias + tokens + pedidos generalizados
-- ─────────────────────────────────────────────────────────────────────────────

-- Huéspedes del hotel
CREATE TABLE IF NOT EXISTS hotel_huespedes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id    text REFERENCES clientes(id) ON DELETE SET NULL,
  nombre        text NOT NULL,
  email         text,
  telefono      text,
  nacionalidad  text,
  preferencias  jsonb DEFAULT '{}'::jsonb,
  notas         text DEFAULT '',
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE hotel_huespedes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "huespedes_all" ON hotel_huespedes;
CREATE POLICY "huespedes_all" ON hotel_huespedes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON hotel_huespedes TO anon, authenticated;

-- Estancias = reservas de hotel
CREATE TABLE IF NOT EXISTS hotel_estancias (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo         text UNIQUE NOT NULL,
  huesped_id     uuid REFERENCES hotel_huespedes(id) ON DELETE SET NULL,
  habitacion_id  uuid REFERENCES hotel_habitaciones(id) ON DELETE SET NULL,
  check_in_at    timestamptz,
  check_out_at   timestamptz,
  pax_adultos    int DEFAULT 2,
  pax_ninos      int DEFAULT 0,
  estado         text DEFAULT 'reservada',  -- reservada | in_house | checked_out | cancelada
  notas          text DEFAULT '',
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_estancias_huesped ON hotel_estancias(huesped_id);
CREATE INDEX IF NOT EXISTS idx_estancias_habitacion ON hotel_estancias(habitacion_id);
CREATE INDEX IF NOT EXISTS idx_estancias_estado ON hotel_estancias(estado);
ALTER TABLE hotel_estancias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "estancias_all" ON hotel_estancias;
CREATE POLICY "estancias_all" ON hotel_estancias FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON hotel_estancias TO anon, authenticated;

-- Tokens del guest portal (sin login)
CREATE TABLE IF NOT EXISTS hotel_guest_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token        text UNIQUE NOT NULL,
  estancia_id  uuid REFERENCES hotel_estancias(id) ON DELETE CASCADE,
  expira_at    timestamptz NOT NULL,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_guest_tokens_token ON hotel_guest_tokens(token);
ALTER TABLE hotel_guest_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "guest_tokens_all" ON hotel_guest_tokens;
CREATE POLICY "guest_tokens_all" ON hotel_guest_tokens FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON hotel_guest_tokens TO anon, authenticated;

-- Ubicaciones de entrega (cabanas, beach beds, etc.)
CREATE TABLE IF NOT EXISTS hotel_delivery_locations (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo    text NOT NULL,        -- room | cabana | beach_bed | otro
  nombre  text NOT NULL,
  activo  boolean DEFAULT true,
  orden   int DEFAULT 0
);
ALTER TABLE hotel_delivery_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "delivery_loc_all" ON hotel_delivery_locations;
CREATE POLICY "delivery_loc_all" ON hotel_delivery_locations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON hotel_delivery_locations TO anon, authenticated;

-- Extensiones a menu_items (mobile-ready)
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS foto_url text;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS disponible boolean DEFAULT true;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS destacado boolean DEFAULT false;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS modificadores jsonb DEFAULT '[]'::jsonb;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS tiempo_prep_min int DEFAULT 15;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS tags text[] DEFAULT ARRAY[]::text[];

-- Generalizar pedidos para multi-canal + multi-método
ALTER TABLE hotel_room_service_pedidos ADD COLUMN IF NOT EXISTS estancia_id uuid REFERENCES hotel_estancias(id) ON DELETE SET NULL;
ALTER TABLE hotel_room_service_pedidos ADD COLUMN IF NOT EXISTS delivery_tipo text DEFAULT 'room';
ALTER TABLE hotel_room_service_pedidos ADD COLUMN IF NOT EXISTS delivery_ubicacion text;
ALTER TABLE hotel_room_service_pedidos ADD COLUMN IF NOT EXISTS metodo_pago text DEFAULT 'cargo_habitacion';
ALTER TABLE hotel_room_service_pedidos ADD COLUMN IF NOT EXISTS pago_estado text DEFAULT 'pendiente';
ALTER TABLE hotel_room_service_pedidos ADD COLUMN IF NOT EXISTS propina numeric DEFAULT 0;
ALTER TABLE hotel_room_service_pedidos ADD COLUMN IF NOT EXISTS eta_min int DEFAULT 30;
ALTER TABLE hotel_room_service_pedidos ADD COLUMN IF NOT EXISTS pos_sync jsonb;
ALTER TABLE hotel_room_service_pedidos ADD COLUMN IF NOT EXISTS canal text DEFAULT 'staff_manual';
ALTER TABLE hotel_room_service_pedidos ADD COLUMN IF NOT EXISTS timeline jsonb DEFAULT '[]'::jsonb;

-- Cargos al folio de habitación
CREATE TABLE IF NOT EXISTS hotel_room_charges (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estancia_id    uuid REFERENCES hotel_estancias(id) ON DELETE CASCADE,
  origen         text NOT NULL,
  origen_ref     uuid,
  descripcion    text NOT NULL,
  monto          numeric NOT NULL,
  metodo_cierre  text,
  cerrado_at     timestamptz,
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_room_charges_estancia ON hotel_room_charges(estancia_id);
ALTER TABLE hotel_room_charges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "room_charges_all" ON hotel_room_charges;
CREATE POLICY "room_charges_all" ON hotel_room_charges FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON hotel_room_charges TO anon, authenticated;

-- Telemetría
CREATE TABLE IF NOT EXISTS menu_item_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estancia_id  uuid REFERENCES hotel_estancias(id) ON DELETE SET NULL,
  item_id      text,
  event_type   text NOT NULL,
  metadata     jsonb,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mie_created ON menu_item_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mie_estancia ON menu_item_events(estancia_id);
ALTER TABLE menu_item_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mie_all" ON menu_item_events;
CREATE POLICY "mie_all" ON menu_item_events FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON menu_item_events TO anon, authenticated;

-- Realtime: publicar tabla de pedidos
ALTER PUBLICATION supabase_realtime ADD TABLE hotel_room_service_pedidos;
