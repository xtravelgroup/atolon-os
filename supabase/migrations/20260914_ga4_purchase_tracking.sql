-- GA4 · Measurement Protocol (server-side) para reservas confirmadas.
--
-- Objetivo: capturar en GA4 la conversión de reservas que cierran fuera del
-- navegador del cliente (WhatsApp, Marea, agencias). El evento purchase del
-- lado del cliente (src/lib/gtm.js -> gtmPurchase) sigue siendo la primera
-- fuente cuando el pago se aprueba en línea; este flujo cubre el resto.
--
-- Requiere secrets: GA_MEASUREMENT_ID, GA_API_SECRET (supabase secrets set …).
-- El GA_MEASUREMENT_ID por defecto se lee de configuracion.ga4_id si no está.

alter table public.reservas
  add column if not exists ga_client_id  text,
  add column if not exists ga_session_id text,
  add column if not exists ga_sent_at    timestamptz;

comment on column public.reservas.ga_client_id
  is 'GA4 client_id (cookie _ga) capturado en el widget al crear la reserva.';
comment on column public.reservas.ga_session_id
  is 'GA4 session_id capturado en el widget al crear la reserva.';
comment on column public.reservas.ga_sent_at
  is 'Momento en que el evento purchase se envió a GA4 vía Measurement Protocol. Idempotencia.';

-- pg_net habilita la llamada HTTP desde el trigger. Es la misma extensión que
-- ya usan otras integraciones del proyecto; con "if not exists" no rompe.
create extension if not exists pg_net with schema extensions;

-- URL del proyecto + service_role en Vault. Estas dos líneas se ejecutan UNA
-- sola vez desde el SQL editor (no van dentro del script porque requieren los
-- valores reales que no queremos versionar):
--   select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'project_url');
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');

create or replace function public.notify_ga4_purchase()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_key text;
begin
  -- Solo cuando pasa a "confirmado" (nunca femenino en la BD real) y no se
  -- ha enviado antes. Cubre INSERT directo confirmado y transición pendiente
  -- → confirmado. No se dispara para "pendiente_pago" ni "cancelado".
  if new.estado = 'confirmado'
     and (tg_op = 'INSERT' or old.estado is distinct from 'confirmado')
     and new.ga_sent_at is null then

    select decrypted_secret into v_url
      from vault.decrypted_secrets where name = 'project_url';
    select decrypted_secret into v_key
      from vault.decrypted_secrets where name = 'service_role_key';

    if v_url is null or v_key is null then
      raise warning 'notify_ga4_purchase: vault secrets project_url/service_role_key no configurados; skip reserva %', new.id;
      return new;
    end if;

    perform net.http_post(
      url     := v_url || '/functions/v1/ga4-purchase',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body    := jsonb_build_object('reserva_id', new.id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ga4_purchase on public.reservas;
create trigger trg_ga4_purchase
  after insert or update of estado on public.reservas
  for each row execute function public.notify_ga4_purchase();
