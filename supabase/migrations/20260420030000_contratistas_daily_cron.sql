-- Cron diario para vencimientos de contratistas (7am Bogotá = 12:00 UTC)
DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'contratistas-daily';
  IF FOUND THEN PERFORM cron.unschedule(jid); END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'contratistas-daily',
  '0 12 * * *',
  $$SELECT net.http_post(
    url := 'https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/contratistas-daily-check',
    timeout_milliseconds := 30000
  );$$
);
