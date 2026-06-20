-- Inventario de secretos (API keys, tokens, webhooks) usados por el sistema.
-- Permite trackear qué tenemos, dónde se configura, cuándo fue la última
-- rotación, y cuándo toca la próxima.

CREATE TABLE IF NOT EXISTS public.secrets_inventory (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre              text UNIQUE NOT NULL,
  descripcion         text NOT NULL,
  categoria           text NOT NULL,           -- supabase | stripe | wompi | zoho | meta | loggro | resend | otros
  donde_se_usa        text NOT NULL,           -- "frontend", "edge functions", "print-agent", "vercel middleware"
  donde_se_configura  text NOT NULL,           -- "Vercel env", "Supabase Functions Secrets", "print-agent/.env"
  criticidad          text NOT NULL CHECK (criticidad IN ('alta','media','baja')),
  rotable             boolean NOT NULL DEFAULT true,    -- algunos como pixel IDs no rotan
  ultima_rotacion     date,
  proxima_rotacion    date,                    -- recomendada
  frecuencia_meses    int NOT NULL DEFAULT 12, -- cada cuántos meses idealmente
  notas               text,
  activo              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_secrets_inv_proxima
  ON public.secrets_inventory (proxima_rotacion)
  WHERE activo = true;

GRANT SELECT, INSERT, UPDATE ON public.secrets_inventory TO authenticated;

-- Historial de rotaciones
CREATE TABLE IF NOT EXISTS public.secrets_rotations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_id       uuid NOT NULL REFERENCES public.secrets_inventory(id) ON DELETE CASCADE,
  rotated_at      timestamptz NOT NULL DEFAULT now(),
  rotated_by      text,
  motivo          text,                        -- "calendario" | "incidente" | "empleado_saliente" | "filtración"
  notas           text
);

CREATE INDEX IF NOT EXISTS idx_secrets_rot_secret
  ON public.secrets_rotations (secret_id, rotated_at DESC);

GRANT SELECT, INSERT ON public.secrets_rotations TO authenticated;

-- Trigger: al insertar una rotación, actualizar ultima_rotacion y proxima_rotacion
CREATE OR REPLACE FUNCTION public.secrets_after_rotation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.secrets_inventory
  SET ultima_rotacion  = NEW.rotated_at::date,
      proxima_rotacion = (NEW.rotated_at::date + (frecuencia_meses || ' months')::interval)::date,
      updated_at       = now()
  WHERE id = NEW.secret_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_secrets_after_rotation ON public.secrets_rotations;
CREATE TRIGGER trg_secrets_after_rotation
  AFTER INSERT ON public.secrets_rotations
  FOR EACH ROW EXECUTE FUNCTION public.secrets_after_rotation();

-- Pre-seed con los secretos detectados en el codebase
INSERT INTO public.secrets_inventory (nombre, descripcion, categoria, donde_se_usa, donde_se_configura, criticidad, frecuencia_meses, notas) VALUES
  -- Supabase
  ('SUPABASE_URL', 'URL del proyecto Supabase', 'supabase', 'frontend, edge functions, print-agent, vercel middleware', 'Vercel + Supabase Functions Secrets + print-agent/.env', 'baja', 999, 'No rota — es identidad del proyecto'),
  ('VITE_SUPABASE_ANON_KEY', 'Anon key del frontend (RLS la protege)', 'supabase', 'frontend (Vercel + print-agent)', 'Vercel env + print-agent/.env', 'media', 12, 'Pública por diseño, pero rotable. Rotación requiere rebuild de .exe del print-agent'),
  ('SUPABASE_ANON_KEY', 'Anon key para edge functions y middleware', 'supabase', 'edge functions, vercel middleware', 'Supabase Functions Secrets + Vercel env', 'media', 12, 'Igual valor que VITE_SUPABASE_ANON_KEY — rotación conjunta'),
  ('SUPABASE_SERVICE_ROLE_KEY', 'Service role — bypassa RLS', 'supabase', 'edge functions, api/* vercel functions', 'Supabase Functions Secrets + Vercel env', 'alta', 6, 'CRÍTICO. Nunca exponer en frontend ni commits.'),

  -- Stripe
  ('STRIPE_SECRET_KEY', 'Stripe API server-side', 'stripe', 'edge function create-stripe-session, stripe-webhook', 'Supabase Functions Secrets', 'alta', 12, 'Producción separada de test'),
  ('STRIPE_WEBHOOK_SECRET', 'Verifica firmas de webhooks Stripe', 'stripe', 'stripe-webhook', 'Supabase Functions Secrets', 'alta', 12, 'Si rota, actualizar también en Stripe Dashboard'),

  -- Wompi
  ('VITE_WOMPI_PUB_KEY', 'Wompi public key frontend', 'wompi', 'frontend booking engine', 'Vercel env', 'baja', 999, 'Públicada por diseño'),
  ('VITE_WOMPI_INTEGRITY_KEY', 'Wompi integrity key checksum', 'wompi', 'frontend booking engine', 'Vercel env', 'media', 24, 'Genera firma de transacciones'),
  ('WOMPI_PRIVATE_KEY', 'Wompi private key server', 'wompi', 'edge function wompi-webhook', 'Supabase Functions Secrets', 'alta', 12, NULL),
  ('WOMPI_EVENTS_KEY', 'Wompi events identifier', 'wompi', 'edge function wompi-webhook', 'Supabase Functions Secrets', 'media', 12, NULL),
  ('WOMPI_EVENTS_SECRET', 'Wompi events secret', 'wompi', 'edge function wompi-webhook', 'Supabase Functions Secrets', 'alta', 12, NULL),

  -- Zoho
  ('ZOHO_API_KEY', 'Zoho Payments API', 'zoho', 'edge function zoho-payments', 'Supabase Functions Secrets', 'alta', 12, NULL),
  ('ZOHO_CLIENT_ID', 'OAuth client id', 'zoho', 'edge function zoho-payments', 'Supabase Functions Secrets', 'media', 999, 'Solo cambia si re-creamos la app en Zoho'),
  ('ZOHO_CLIENT_SECRET', 'OAuth client secret', 'zoho', 'edge function zoho-payments', 'Supabase Functions Secrets', 'alta', 12, NULL),
  ('ZOHO_REFRESH_TOKEN', 'OAuth refresh token', 'zoho', 'edge function zoho-payments', 'Supabase Functions Secrets', 'alta', 6, 'Si caduca se renegocia con Zoho'),
  ('ZOHO_ACCOUNT_ID', 'ID de la cuenta Zoho', 'zoho', 'edge function zoho-payments', 'Supabase Functions Secrets', 'baja', 999, 'Identificador, no secreto'),
  ('ZOHO_SIGNING_KEY', 'Firma de webhooks', 'zoho', 'edge function zoho-payments', 'Supabase Functions Secrets', 'alta', 12, NULL),
  ('ZOHO_WEBHOOK_SECRET', 'Webhook validation', 'zoho', 'edge function zoho-payments', 'Supabase Functions Secrets', 'alta', 12, NULL),

  -- Meta / WhatsApp
  ('META_WHATSAPP_TOKEN', 'Meta Cloud API token', 'meta', 'edge function send-whatsapp, whatsapp-webhook, whatsapp-ai', 'Supabase Functions Secrets', 'alta', 2, 'CADUCA cada 2 meses si se generó como temporal. Generar permanente desde Meta Business.'),
  ('META_WHATSAPP_PHONE_ID', 'ID del número de WhatsApp', 'meta', 'edge function send-whatsapp', 'Supabase Functions Secrets', 'baja', 999, 'Identificador'),
  ('META_WHATSAPP_VERIFY_TOKEN', 'Verificación de webhook', 'meta', 'edge function whatsapp-webhook', 'Supabase Functions Secrets', 'media', 24, NULL),
  ('META_WHATSAPP_WABA_ID', 'WhatsApp Business Account ID', 'meta', 'edge function whatsapp-ai', 'Supabase Functions Secrets', 'baja', 999, 'Identificador'),
  ('VITE_META_PIXEL_ID', 'Meta pixel para tracking web', 'meta', 'frontend', 'Vercel env', 'baja', 999, 'Identificador'),

  -- Loggro
  ('LOGGRO_EMAIL', 'Usuario login Loggro', 'loggro', 'edge function loggro-sync, loggro-pymes-sync', 'Supabase Functions Secrets', 'media', 24, NULL),
  ('LOGGRO_PASSWORD', 'Password login Loggro', 'loggro', 'edge function loggro-sync, loggro-pymes-sync', 'Supabase Functions Secrets', 'alta', 6, NULL),
  ('LOGGRO_PYMES_TOKEN', 'Token API Loggro Pyme', 'loggro', 'edge function loggro-pymes-sync', 'Supabase Functions Secrets', 'alta', 12, NULL),
  ('LOGGRO_NOMINA_TOKEN', 'Token API Loggro Nómina', 'loggro', 'edge function loggro-nomina-sync', 'Supabase Functions Secrets', 'alta', 12, NULL),

  -- AI / LLM
  ('ANTHROPIC_API_KEY', 'Claude API key (Tatiana)', 'otros', 'edge function tatiana-chat, whatsapp-ai', 'Supabase Functions Secrets', 'alta', 12, NULL),

  -- Email / Notif
  ('RESEND_API_KEY', 'Resend API para emails transaccionales', 'otros', 'edge function (alertas, motor-alertas), vercel api', 'Supabase Functions Secrets + Vercel env', 'alta', 12, NULL),

  -- Otros
  ('CRON_SECRET', 'Auth cron jobs Vercel', 'otros', 'vercel api/cron endpoints', 'Vercel env', 'media', 12, NULL),
  ('GYG_BASIC_AUTH_USER', 'GetYourGuide partner API user', 'otros', 'edge function gyg-api', 'Supabase Functions Secrets', 'media', 24, NULL),
  ('GYG_BASIC_AUTH_PASS', 'GetYourGuide partner API pass', 'otros', 'edge function gyg-api', 'Supabase Functions Secrets', 'alta', 12, NULL),
  ('ALERTAS_DESTINATARIOS', 'Email/teléfono para alertas', 'otros', 'edge function motor-alertas', 'Supabase Functions Secrets', 'baja', 999, 'Config, no secreto')
ON CONFLICT (nombre) DO NOTHING;
