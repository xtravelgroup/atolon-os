-- ============================================
-- ATOLON OS — Todas las tablas
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- ── 1. RESERVAS ──────────────────────────────
create table if not exists reservas (
  id text primary key,
  fecha date not null,
  salida_id text not null,
  tipo text not null,
  canal text not null default 'Web',
  nombre text not null,
  contacto text,
  pax integer not null default 1,
  pax_a integer default 0,
  pax_n integer default 0,
  agencia text,
  precio_u integer not null default 0,
  total integer not null default 0,
  abono integer default 0,
  saldo integer default 0,
  estado text default 'confirmado' check (estado in ('confirmado','pendiente','cancelado')),
  ep text default 'pendiente',
  ci text,
  co text,
  extension boolean default false,
  ext_regreso text,
  notas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_reservas_fecha on reservas(fecha);
create index if not exists idx_reservas_salida on reservas(salida_id);
create index if not exists idx_reservas_estado on reservas(estado);

-- ── 2. CIERRES ───────────────────────────────
create table if not exists cierres (
  id text primary key,
  tipo text not null check (tipo in ('total','parcial')),
  fecha date not null,
  salidas text[] default '{}',
  motivo text,
  titulo text,
  descripcion text,
  mensaje_publico text,
  reubicar boolean default true,
  activo boolean default true,
  notificados boolean default false,
  creado_por text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_cierres_fecha on cierres(fecha);
create index if not exists idx_cierres_activo on cierres(activo);

-- ── 3. LEADS (Comercial) ────────────────────
create table if not exists leads (
  id text primary key,
  vendedor text,
  canal text,
  nombre text not null,
  contacto text,
  tel text,
  email text,
  valor_est integer default 0,
  stage text default 'Nuevo' check (stage in ('Nuevo','Contactado','Cotizado','Cerrado Ganado','Perdido')),
  fecha_creacion date default current_date,
  ultimo_contacto date,
  proxima_accion text,
  prox_fecha date,
  notas text,
  etiquetas text[] default '{}',
  perdido_razon text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_leads_stage on leads(stage);
create index if not exists idx_leads_vendedor on leads(vendedor);

-- ── 4. ALIADOS B2B ──────────────────────────
create table if not exists aliados_b2b (
  id text primary key,
  tipo text not null check (tipo in ('Hotel','Agencia','Revendedor')),
  nombre text not null,
  contacto text,
  tel text,
  email text,
  comision integer default 0,
  pax_mes integer default 0,
  revenue integer default 0,
  estado text default 'activo' check (estado in ('activo','inactivo')),
  notas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_b2b_estado on aliados_b2b(estado);
create index if not exists idx_b2b_tipo on aliados_b2b(tipo);

-- ── 5. EVENTOS ──────────────────────────────
create table if not exists eventos (
  id text primary key,
  nombre text not null,
  tipo text not null,
  fecha date,
  pax integer default 0,
  valor integer default 0,
  stage text default 'Consulta' check (stage in ('Consulta','Cotizado','Confirmado','Realizado')),
  contacto text,
  tel text,
  email text,
  servicios jsonb default '[]',
  notas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_eventos_stage on eventos(stage);
create index if not exists idx_eventos_fecha on eventos(fecha);

-- ── 6. ACTIVOS ──────────────────────────────
create table if not exists activos (
  id text primary key,
  cat text not null,
  nombre text not null,
  marca text,
  modelo text,
  serie text,
  valor integer default 0,
  fecha_compra date,
  garantia_hasta date,
  estado text default 'bueno' check (estado in ('bueno','regular','mantenimiento','baja')),
  area text,
  deprec integer default 0,
  notas text,
  mantenimientos jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_activos_cat on activos(cat);
create index if not exists idx_activos_estado on activos(estado);

-- ── 7. EMPLEADOS ────────────────────────────
create table if not exists empleados (
  id text primary key,
  nombre text not null,
  cedula text unique not null,
  cargo text,
  area text,
  pin_hash text,
  salario integer default 0,
  activo boolean default true,
  fecha_ingreso date,
  horarios jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_empleados_cedula on empleados(cedula);
create index if not exists idx_empleados_activo on empleados(activo);

-- ── TRIGGER updated_at para todas las tablas ─
-- (reutiliza la funcion update_updated_at ya creada con requisiciones)

drop trigger if exists set_updated_at on reservas;
create trigger set_updated_at before update on reservas for each row execute function update_updated_at();

drop trigger if exists set_updated_at on cierres;
create trigger set_updated_at before update on cierres for each row execute function update_updated_at();

drop trigger if exists set_updated_at on leads;
create trigger set_updated_at before update on leads for each row execute function update_updated_at();

drop trigger if exists set_updated_at on aliados_b2b;
create trigger set_updated_at before update on aliados_b2b for each row execute function update_updated_at();

drop trigger if exists set_updated_at on eventos;
create trigger set_updated_at before update on eventos for each row execute function update_updated_at();

drop trigger if exists set_updated_at on activos;
create trigger set_updated_at before update on activos for each row execute function update_updated_at();

drop trigger if exists set_updated_at on empleados;
create trigger set_updated_at before update on empleados for each row execute function update_updated_at();

-- ── RLS — Politicas permisivas (desarrollo) ─

alter table reservas enable row level security;
create policy "anon_all_reservas" on reservas for all to anon using (true) with check (true);

alter table cierres enable row level security;
create policy "anon_all_cierres" on cierres for all to anon using (true) with check (true);

alter table leads enable row level security;
create policy "anon_all_leads" on leads for all to anon using (true) with check (true);

alter table aliados_b2b enable row level security;
create policy "anon_all_b2b" on aliados_b2b for all to anon using (true) with check (true);

alter table eventos enable row level security;
create policy "anon_all_eventos" on eventos for all to anon using (true) with check (true);

alter table activos enable row level security;
create policy "anon_all_activos" on activos for all to anon using (true) with check (true);

alter table empleados enable row level security;
create policy "anon_all_empleados" on empleados for all to anon using (true) with check (true);
