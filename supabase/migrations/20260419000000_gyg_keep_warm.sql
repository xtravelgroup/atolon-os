-- Keep-warm cron: llama a /health de gyg-api cada minuto para evitar cold starts
-- Requiere pg_cron y pg_net habilitados

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Quitar job previo si existe
DO $$
DECLARE jobid bigint;
BEGIN
  SELECT jobid INTO jobid FROM cron.job WHERE jobname = 'gyg-api-keep-warm';
  IF FOUND THEN
    PERFORM cron.unschedule(jobid);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Cada minuto hacer un ping
SELECT cron.schedule(
  'gyg-api-keep-warm',
  '* * * * *',
  $$
  SELECT net.http_get(
    url := 'https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/gyg-api/health',
    timeout_milliseconds := 5000
  );
  $$
);
