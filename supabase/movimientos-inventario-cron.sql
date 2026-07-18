-- ============================================================
-- Cron nocturno: descontar ventas Restobar del día terminado
-- Fase 2 del proyecto Inventario/Almacenes de Atolón OS.
-- Corre todos los días a las 23:59 Bogotá (04:59 UTC del dia
-- siguiente) y llama al edge function que expande recetas de
-- Loggro y descuenta stock en items_catalogo + registra en
-- movimientos_inventario_atolon.
-- ============================================================

SELECT cron.schedule(
  'loggro-ventas-descontar-diario',
  '59 4 * * *',
  $$
  SELECT net.http_post(
    url:='https://ncdyttgxuicyruathkxd.supabase.co/functions/v1/loggro-sync/ventas-restobar-descontar',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jZHl0dGd4dWljeXJ1YXRoa3hkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDg5Njg0OSwiZXhwIjoyMDkwNDcyODQ5fQ.nUq5gtXQSsmXKighTLqJ2mUk6-s3bK017wppb9iL578"}'::jsonb,
    body:=jsonb_build_object('fecha', to_char(NOW() AT TIME ZONE 'America/Bogota' - INTERVAL '5 minutes', 'YYYY-MM-DD')),
    timeout_milliseconds:=180000
  );
  $$
);

-- Ver: SELECT * FROM cron.job WHERE jobname='loggro-ventas-descontar-diario';
-- Desprogramar: SELECT cron.unschedule('loggro-ventas-descontar-diario');
-- Historial ejecuciones: SELECT * FROM cron.job_run_details WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname='loggro-ventas-descontar-diario') ORDER BY start_time DESC LIMIT 20;
