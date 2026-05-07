-- Cache persistente para el endpoint loggro-sync/cierre-caja-rango.
-- Reemplaza la lectura cara de 20.000 invoices contra Loggro Restobar API
-- con un lookup en tabla local (10ms). Cada entrada vive 5 minutos.
--
-- Key: from + to (mismo formato que pide el cliente)
-- Value: el JSON completo del response de Loggro
-- expires_at: 5 min después de cuando se guardó

CREATE TABLE IF NOT EXISTS loggro_ayb_cache (
  cache_key  text PRIMARY KEY,           -- "YYYY-MM-DD|YYYY-MM-DD"
  from_date  date NOT NULL,
  to_date    date NOT NULL,
  payload    jsonb NOT NULL,
  cached_at  timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_loggro_cache_expires ON loggro_ayb_cache(expires_at);

-- Limpiar entradas expiradas viejas — el endpoint también borra al insertar.
DELETE FROM loggro_ayb_cache WHERE expires_at < now() - interval '1 day';

-- RLS: solo authenticated lee/escribe vía service_role en edge function.
ALTER TABLE loggro_ayb_cache ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='loggro_ayb_cache'::regclass AND polname='loggro_cache_auth_read') THEN
    EXECUTE 'CREATE POLICY loggro_cache_auth_read ON loggro_ayb_cache FOR SELECT TO authenticated USING (true)';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
