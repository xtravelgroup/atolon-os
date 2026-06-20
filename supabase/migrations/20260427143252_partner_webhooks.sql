-- ─────────────────────────────────────────────────────────────────────────────
-- Partner Webhooks — para reenviar eventos de conversión (server-side) a
-- agencias/aliados que embeben el booking de Atolón en sus propias páginas.
--
-- Caso de uso inicial: Sky Agency embebe el iframe de booking en su sitio y
-- necesita conversiones server-side para Meta CAPI / GA4 Measurement Protocol
-- que sobrevivan adblockers e ITP. El cliente-side bridge (postMessage) cubre
-- el funnel en vivo; este webhook cubre la conversión autoritativa.
--
-- Flow:
--   1. Wompi confirma pago → api/wompi-webhook.js
--   2. wompi-webhook actualiza reserva + busca ac_cart asociado (UTMs+click_ids)
--   3. Carga partners activos suscritos a "purchase" desde partner_webhooks
--   4. Construye payload firmado HMAC-SHA256 + POSTea a webhook_url
--   5. Loguea en partner_webhook_log
-- ─────────────────────────────────────────────────────────────────────────────

-- Tabla principal: configuración de partners
create table if not exists public.partner_webhooks (
  id              uuid primary key default gen_random_uuid(),
  partner_name    text not null,                                -- "Sky Agency"
  webhook_url     text not null,                                -- https://sky-domain.com/api/atolon-conversion
  secret          text not null,                                -- HMAC-SHA256 signing secret
  events          text[] not null default array['purchase']::text[],
  active          boolean not null default true,
  origin_match    text,                                         -- opcional: filtrar por subdominio del referrer
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_success_at timestamptz,
  last_error_at   timestamptz,
  last_error_msg  text,
  total_sent      integer not null default 0,
  total_failed    integer not null default 0
);

create index if not exists partner_webhooks_active_idx
  on public.partner_webhooks (active) where active = true;

-- Log de cada delivery (auditoría + debugging para partners)
create table if not exists public.partner_webhook_log (
  id              uuid primary key default gen_random_uuid(),
  partner_id      uuid references public.partner_webhooks(id) on delete cascade,
  delivery_id     text not null,                                -- X-Atolon-Delivery (UUID por intento)
  event           text not null,                                -- "purchase" | "refund" | etc.
  reserva_id      text,
  payload         jsonb,
  request_headers jsonb,
  response_status integer,
  response_body   text,
  duration_ms     integer,
  attempt         integer not null default 1,
  error           text,
  created_at      timestamptz not null default now()
);

create index if not exists partner_webhook_log_partner_idx
  on public.partner_webhook_log (partner_id, created_at desc);

create index if not exists partner_webhook_log_reserva_idx
  on public.partner_webhook_log (reserva_id);

-- RLS: pattern estándar Atolón — auth ALL ALL
alter table public.partner_webhooks     enable row level security;
alter table public.partner_webhook_log  enable row level security;

drop policy if exists "auth_all" on public.partner_webhooks;
create policy "auth_all" on public.partner_webhooks
  for all to authenticated
  using (true) with check (true);

drop policy if exists "auth_all_log" on public.partner_webhook_log;
create policy "auth_all_log" on public.partner_webhook_log
  for all to authenticated
  using (true) with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Extender ac_carts con click-IDs (Meta/Google/TikTok/LinkedIn) y user_agent.
-- Estos datos viajan en el webhook server-side para que Sky pueda atribuir la
-- conversión a la campaña que originó el clic.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.ac_carts add column if not exists fbclid     text;
alter table public.ac_carts add column if not exists gclid      text;
alter table public.ac_carts add column if not exists wbraid     text;
alter table public.ac_carts add column if not exists gbraid     text;
alter table public.ac_carts add column if not exists ttclid     text;
alter table public.ac_carts add column if not exists msclkid    text;
alter table public.ac_carts add column if not exists li_fat_id  text;
alter table public.ac_carts add column if not exists user_agent text;

-- Trigger: mantener updated_at en partner_webhooks
create or replace function public._partner_webhooks_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_partner_webhooks_updated_at on public.partner_webhooks;
create trigger trg_partner_webhooks_updated_at
  before update on public.partner_webhooks
  for each row execute function public._partner_webhooks_set_updated_at();
