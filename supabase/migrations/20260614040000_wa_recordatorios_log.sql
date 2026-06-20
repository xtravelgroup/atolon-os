-- Log de recordatorios WhatsApp para dedupe — evita enviar el mismo
-- recordatorio dos veces si el cron pg_cron se re-ejecuta.

CREATE TABLE IF NOT EXISTS public.wa_recordatorios_log (
  id              bigserial PRIMARY KEY,
  reserva_id      text NOT NULL,
  tipo            text NOT NULL,             -- '24h' | '2h'
  fecha_envio     date NOT NULL,
  meta_message_id text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wa_recordatorios_uniq UNIQUE (reserva_id, tipo, fecha_envio)
);

CREATE INDEX IF NOT EXISTS idx_wa_recordatorios_lookup
  ON public.wa_recordatorios_log (reserva_id, tipo, fecha_envio);

COMMENT ON TABLE public.wa_recordatorios_log IS
  'Dedupe de recordatorios WhatsApp. UNIQUE(reserva_id,tipo,fecha) evita duplicados si pg_cron re-ejecuta.';
