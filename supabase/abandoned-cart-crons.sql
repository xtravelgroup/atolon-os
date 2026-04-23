-- ═══════════════════════════════════════════════════════════════════════════
-- CRON JOBS — CARRITO ABANDONADO
-- Ejecutar en Supabase Dashboard > SQL Editor
-- Requiere: pg_cron + pg_net habilitados en el proyecto
--
-- IMPORTANTE: Reemplazar {SERVICE_ROLE_KEY} con la llave real de tu proyecto
-- (Supabase Dashboard > Project Settings > API > service_role)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Detector: cada 15 minutos
--    Detecta carritos en checkout_started > 60 min y los marca como abandoned.
--    Programa la cola de 4 emails.
SELECT cron.schedule(
  'ac-detector',
  '*/15 * * * *',
  $$
  SELECT
    net.http_post(
      url        := 'https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/abandoned-cart-detector',
      headers    := '{"Content-Type":"application/json","Authorization":"Bearer {SERVICE_ROLE_KEY}"}'::jsonb,
      body       := '{}'::jsonb
    )
  $$
);

-- 2. Sender: cada 5 minutos
--    Lee la cola de emails pendientes y los envía via Resend.
SELECT cron.schedule(
  'ac-sender',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
      url        := 'https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/abandoned-cart-sender',
      headers    := '{"Content-Type":"application/json","Authorization":"Bearer {SERVICE_ROLE_KEY}"}'::jsonb,
      body       := '{}'::jsonb
    )
  $$
);

-- Para verificar jobs activos:
-- SELECT * FROM cron.job;

-- Para eliminar los jobs:
-- SELECT cron.unschedule('ac-detector');
-- SELECT cron.unschedule('ac-sender');
