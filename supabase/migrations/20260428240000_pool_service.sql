-- Pool Service — Pedidos desde áreas de servicio (piscina, beach, cabañas)
-- Similar al módulo de Room Service del hotel, pero para zonas exteriores
-- del beach club. Cada área tiene un QR que el huésped escanea para pedir.

-- ── Áreas de servicio ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pool_service_areas (
  id          text PRIMARY KEY,
  nombre      text NOT NULL,
  zona        text,
  -- 'piscina', 'piscina_chica', 'beach', 'cabana', 'bar', 'vip', 'otra'
  tipo        text NOT NULL DEFAULT 'piscina',
  capacidad   integer DEFAULT 0,
  qr_code     text UNIQUE,
  notas       text,
  activo      boolean NOT NULL DEFAULT true,
  -- Orden de despliegue en la UI
  orden       integer DEFAULT 0,
  created_at  timestamp with time zone DEFAULT now(),
  updated_at  timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pool_areas_activo ON pool_service_areas(activo);
CREATE INDEX IF NOT EXISTS idx_pool_areas_qr     ON pool_service_areas(qr_code);

-- ── Pedidos ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pool_service_pedidos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo            text UNIQUE NOT NULL,
  area_id           text REFERENCES pool_service_areas(id) ON DELETE SET NULL,
  area_nombre       text,
  -- Identificación del huésped (texto libre — no necesariamente registrado)
  huesped           text,
  pax               integer DEFAULT 1,
  -- Items en formato jsonb [{id, nombre, cantidad, precio_unit, notas}]
  items             jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal          numeric(14,2) NOT NULL DEFAULT 0,
  total             numeric(14,2) NOT NULL DEFAULT 0,
  notas             text,
  -- Estado del kanban: 'recibido' | 'preparando' | 'listo' | 'entregado' | 'cancelado'
  estado            text NOT NULL DEFAULT 'recibido',
  metodo_pago       text,
  -- 'pendiente' | 'pagado' | 'a_consumo' (cobrar al final con la cuenta del día)
  pago_estado       text DEFAULT 'pendiente',
  reserva_id        text, -- vincular a la reserva del día si existe
  creado_por        text, -- 'huesped' (auto-pedido vía QR) | usuario_id (staff)
  enviado_loggro_at timestamp with time zone,
  loggro_orden_id   text,
  pos_sync          jsonb,
  entregado_at      timestamp with time zone,
  cancelado_at      timestamp with time zone,
  cancelado_motivo  text,
  created_at        timestamp with time zone DEFAULT now(),
  updated_at        timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pool_pedidos_estado     ON pool_service_pedidos(estado);
CREATE INDEX IF NOT EXISTS idx_pool_pedidos_area       ON pool_service_pedidos(area_id);
CREATE INDEX IF NOT EXISTS idx_pool_pedidos_created    ON pool_service_pedidos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pool_pedidos_reserva    ON pool_service_pedidos(reserva_id);

-- ── Trigger updated_at ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_pool_service_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pool_areas_updated_at  ON pool_service_areas;
CREATE TRIGGER pool_areas_updated_at  BEFORE UPDATE ON pool_service_areas  FOR EACH ROW EXECUTE FUNCTION trg_pool_service_updated_at();

DROP TRIGGER IF EXISTS pool_pedidos_updated_at ON pool_service_pedidos;
CREATE TRIGGER pool_pedidos_updated_at BEFORE UPDATE ON pool_service_pedidos FOR EACH ROW EXECUTE FUNCTION trg_pool_service_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE pool_service_areas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_service_pedidos ENABLE ROW LEVEL SECURITY;

-- Áreas: lectura pública (para el QR landing); escritura solo autenticados
DROP POLICY IF EXISTS "pool_areas_read_anon"   ON pool_service_areas;
CREATE POLICY "pool_areas_read_anon"   ON pool_service_areas FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "pool_areas_write_auth" ON pool_service_areas;
CREATE POLICY "pool_areas_write_auth"  ON pool_service_areas FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- Pedidos: anon puede insertar (auto-pedido) y leer su propio pedido por código.
-- Staff (auth) puede todo.
DROP POLICY IF EXISTS "pool_pedidos_insert_anon" ON pool_service_pedidos;
CREATE POLICY "pool_pedidos_insert_anon" ON pool_service_pedidos FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "pool_pedidos_read_anon"   ON pool_service_pedidos;
CREATE POLICY "pool_pedidos_read_anon"   ON pool_service_pedidos FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "pool_pedidos_all_auth"    ON pool_service_pedidos;
CREATE POLICY "pool_pedidos_all_auth"    ON pool_service_pedidos FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- ── Seed: áreas iniciales típicas de Atolón ─────────────────────────────
INSERT INTO pool_service_areas (id, nombre, zona, tipo, capacidad, qr_code, orden) VALUES
  ('AREA-PISCINA-PRINCIPAL', 'Piscina Principal',     'Pool',  'piscina',       40, 'piscina-principal', 10),
  ('AREA-PISCINA-CHICA',     'Piscina Chica',         'Pool',  'piscina_chica', 12, 'piscina-chica',     20),
  ('AREA-BEACH-NORTE',       'Beach Norte',           'Beach', 'beach',         30, 'beach-norte',       30),
  ('AREA-BEACH-SUR',         'Beach Sur',             'Beach', 'beach',         30, 'beach-sur',         40),
  ('AREA-CABANAS',           'Cabañas',               'Beach', 'cabana',        20, 'cabanas',           50),
  ('AREA-BAR-CENTRAL',       'Bar Central',           'Bar',   'bar',            8, 'bar-central',       60),
  ('AREA-VIP',               'VIP Lounge',            'VIP',   'vip',           16, 'vip',               70)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE pool_service_areas   IS 'Zonas de servicio en el beach club (pool, beach, cabañas, bar). Cada una tiene QR para que el huésped pida desde la app.';
COMMENT ON TABLE pool_service_pedidos IS 'Pedidos hechos desde un área de servicio. Similar a hotel_room_service_pedidos pero externo al hotel.';
