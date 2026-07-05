-- Cron cada 2 min: cancela reservas de grupo sin pagar que superaron 30 min.
-- El edge function hotel-cleanup-expiradas hace el trabajo:
--   - Marca estancia como 'cancelada' y limpia expira_en.
--   - Decrementa hotel_grupos.habitaciones_reservadas.
--   - Si el grupo estaba 'agotado' y se libera cupo, vuelve a 'activo'.

DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'hotel-cleanup-expiradas';
  IF FOUND THEN PERFORM cron.unschedule(jid); END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'hotel-cleanup-expiradas',
  '*/2 * * * *',   -- cada 2 min
  $$SELECT net.http_post(
    url := 'https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/hotel-cleanup-expiradas',
    timeout_milliseconds := 15000
  );$$
);
