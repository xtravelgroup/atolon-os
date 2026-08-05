-- =====================================================================
-- Integración Cloudbeds ↔ Atolón OS (Opción C — híbrido)
-- Cloudbeds = channel manager + inventario OTA
-- Atolón = experiencia hotelera (F&B, actividades, eventos, concierge AI)
-- =====================================================================

-- 1) Credenciales OAuth por propiedad Cloudbeds
CREATE TABLE IF NOT EXISTS cloudbeds_credentials (
  id                text PRIMARY KEY,             -- 'CB-{propertyID}'
  property_id       text NOT NULL UNIQUE,         -- propertyID nativo Cloudbeds
  property_nombre   text,
  access_token      text NOT NULL,
  refresh_token     text NOT NULL,
  expires_at        timestamptz NOT NULL,
  scope             text,
  activo            boolean DEFAULT true,
  last_sync_at      timestamptz,
  last_sync_status  text,                          -- 'ok' | 'error' | 'running'
  last_error        text,
  webhook_secret    text,                          -- para validar payloads
  connected_by      text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- 2) Log de sync (auditoría por corrida)
CREATE TABLE IF NOT EXISTS cloudbeds_sync_log (
  id            bigserial PRIMARY KEY,
  property_id   text,
  tipo          text NOT NULL,                     -- 'reservations','rooms','rates','webhook'
  desde         timestamptz,
  hasta         timestamptz,
  registros_in  integer DEFAULT 0,
  registros_up  integer DEFAULT 0,
  registros_new integer DEFAULT 0,
  duracion_ms   integer,
  status        text NOT NULL,                     -- 'ok' | 'error'
  error         text,
  detalle       jsonb,
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_cb_sync_log_prop ON cloudbeds_sync_log(property_id, created_at DESC);

-- 3) Extender hotel_estancias para trazabilidad Cloudbeds
ALTER TABLE hotel_estancias
  ADD COLUMN IF NOT EXISTS cloudbeds_reservation_id text,
  ADD COLUMN IF NOT EXISTS cloudbeds_property_id    text,
  ADD COLUMN IF NOT EXISTS origen                   text DEFAULT 'atolon',   -- 'atolon' | 'cloudbeds' | 'concierge_ai' | 'grupo'
  ADD COLUMN IF NOT EXISTS cloudbeds_sync_at        timestamptz,
  ADD COLUMN IF NOT EXISTS cloudbeds_source         text;                     -- 'booking.com','expedia','direct','airbnb', ...

CREATE UNIQUE INDEX IF NOT EXISTS ux_hotel_estancias_cb_id
  ON hotel_estancias(cloudbeds_reservation_id)
  WHERE cloudbeds_reservation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_hotel_estancias_origen ON hotel_estancias(origen);

-- 4) Igual para hotel_huespedes (para dedup por email + cloudbeds_guest_id)
ALTER TABLE hotel_huespedes
  ADD COLUMN IF NOT EXISTS cloudbeds_guest_id text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_hotel_huespedes_cb_id
  ON hotel_huespedes(cloudbeds_guest_id)
  WHERE cloudbeds_guest_id IS NOT NULL;

-- 5) RLS
ALTER TABLE cloudbeds_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloudbeds_sync_log    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cb_cred_all ON cloudbeds_credentials;
CREATE POLICY cb_cred_all ON cloudbeds_credentials FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM usuarios u
    WHERE lower(u.email) = lower(auth.jwt() ->> 'email')
      AND u.activo = true
      AND (u.rol_id IN ('super_admin','admin','direccion') OR 'hotel_estancias' = ANY(u.modulos))))
  WITH CHECK (EXISTS (SELECT 1 FROM usuarios u
    WHERE lower(u.email) = lower(auth.jwt() ->> 'email')
      AND u.activo = true
      AND (u.rol_id IN ('super_admin','admin','direccion') OR 'hotel_estancias' = ANY(u.modulos))));

DROP POLICY IF EXISTS cb_log_read ON cloudbeds_sync_log;
CREATE POLICY cb_log_read ON cloudbeds_sync_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM usuarios u
    WHERE lower(u.email) = lower(auth.jwt() ->> 'email')
      AND u.activo = true
      AND (u.rol_id IN ('super_admin','admin','direccion') OR 'hotel_estancias' = ANY(u.modulos))));

NOTIFY pgrst, 'reload schema';
