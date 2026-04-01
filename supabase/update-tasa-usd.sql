-- ── 1. Agregar columna tasa_usd_updated_at ──────────────────────────────────
ALTER TABLE configuracion
  ADD COLUMN IF NOT EXISTS tasa_usd_updated_at timestamptz;

-- ── 2. pg_cron: actualizar tasa diariamente a las 8am hora Colombia (UTC-5 = 13:00 UTC) ──
-- Requiere: extensión pg_cron habilitada en Supabase (Database → Extensions → pg_cron)
SELECT cron.schedule(
  'update-tasa-usd-daily',           -- nombre del job (único)
  '0 13 * * *',                      -- cada día a las 13:00 UTC (08:00 Bogotá)
  $$
    SELECT net.http_post(
      url     := 'https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/update-tasa-usd',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer ' ||
                 current_setting('app.service_role_key', true) || '"}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);

-- ── Alternativa si net.http_post no está disponible: usar pg_net directamente ──
-- SELECT cron.schedule(
--   'update-tasa-usd-daily',
--   '0 13 * * *',
--   $$ SELECT pg_net.http_post(
--        'https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/update-tasa-usd',
--        '{}',
--        'application/json',
--        ARRAY[pg_net.http_header('Authorization',
--          'Bearer ' || current_setting('app.service_role_key', true))]
--      ); $$
-- );

-- ── Ver jobs activos ─────────────────────────────────────────────────────────
-- SELECT * FROM cron.job;

-- ── Eliminar job si necesitas recrearlo ─────────────────────────────────────
-- SELECT cron.unschedule('update-tasa-usd-daily');
