-- Columnas para trackear el rescate por Concierge AI en cada lead.
-- concierge_rescued_at: null = pendiente | timestamp = ya se envio mensaje
-- concierge_rescue_channel: 'whatsapp' | 'email' | null (skip)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS concierge_rescued_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS concierge_rescue_channel text;

-- Indice parcial para acelerar el query del cron (busca solo pendientes).
CREATE INDEX IF NOT EXISTS idx_leads_rescue_pending
  ON public.leads(created_at)
  WHERE stage = 'Nuevo' AND concierge_rescued_at IS NULL;

-- pg_cron: cada 2 minutos, invoca la edge function concierge-lead-rescue.
-- La function busca leads en "Nuevo" > 5 min y envia WA/email.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Borrar job previo si existe (idempotente en re-runs)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'concierge-lead-rescue';

-- El schedule cron.schedule('concierge-lead-rescue', '*/2 * * * *', ...) se
-- crea directamente en produccion (run-sql.mjs) para no versionar el JWT
-- service_role en git. Ver cron.job para confirmar. Formato igual a los
-- demas crons del proyecto (ac-detector, hotel-cleanup-expiradas, etc).
