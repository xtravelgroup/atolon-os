-- ── whatsapp_logs: registro de mensajes enviados ──────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_logs (
  id           text PRIMARY KEY,
  to           text NOT NULL,
  template     text NOT NULL,
  params       jsonb,
  status       text DEFAULT 'sent',
  meta_response jsonb,
  reserva_id   text,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE whatsapp_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service manage whatsapp_logs" ON whatsapp_logs FOR ALL TO service_role USING (true);

-- ── Cron job: recordatorios diarios (requiere pg_cron habilitado) ─────────────
-- Ejecutar en Supabase Dashboard → Database → Extensions → habilitar pg_cron
-- Luego correr esto:
/*
SELECT cron.schedule(
  'whatsapp-recordatorios',
  '0 13 * * *',  -- 8am Colombia (UTC-5) = 13:00 UTC
  $$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/whatsapp-recordatorios',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := '{}'::jsonb
    );
  $$
);
*/
