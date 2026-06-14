-- Campo para capturar las UTMs del flujo de booking público.
-- Permite distinguir reservas WEB que vinieron de WhatsApp (utm_source=whatsapp)
-- de las que vinieron orgánicas, marketing, etc.
--
-- Estructura del jsonb:
--   { utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, landing_page }
--
-- Se llena desde BookingPopup.jsx al hacer el insert. Reservas creadas en Atolon OS
-- (id LIKE 'R-%') no usan este campo — quedan null, lo cual es correcto.

ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS utms_capturados jsonb DEFAULT NULL;

COMMENT ON COLUMN public.reservas.utms_capturados IS
  'UTMs + referrer + landing_page capturados al momento del booking público. NULL para reservas admin.';
