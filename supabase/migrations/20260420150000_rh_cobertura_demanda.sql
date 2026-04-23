-- Demanda de staffing por área × día de semana × franja horaria
create table if not exists public.rh_cobertura_demanda (
  id uuid primary key default gen_random_uuid(),
  area_key text not null,         -- ej: "cocina", "bar.bartenders", "meseros.playa"
  dia_semana int not null check (dia_semana between 0 and 6), -- 0=Lun, 6=Dom
  franja text not null,           -- "07-09", "09-11", ... "21-23"
  necesitan int not null default 0,
  updated_at timestamptz default now(),
  unique (area_key, dia_semana, franja)
);

alter table public.rh_cobertura_demanda enable row level security;
drop policy if exists "anon read" on public.rh_cobertura_demanda;
create policy "anon read" on public.rh_cobertura_demanda for select to anon using (true);
drop policy if exists "auth all" on public.rh_cobertura_demanda;
create policy "auth all" on public.rh_cobertura_demanda for all to authenticated using (true) with check (true);
grant all on public.rh_cobertura_demanda to anon, authenticated;

-- Seed sub-area activities for Meseros + Bar (rh_actividades no tiene unique en nombre)
insert into public.rh_actividades (nombre, icono, color, orden, activo)
select 'Playa', '🏖️', '#F59E0B', 10, true
where not exists (select 1 from public.rh_actividades where nombre = 'Playa');

insert into public.rh_actividades (nombre, icono, color, orden, activo)
select 'Piscina', '🏊', '#38BDF8', 11, true
where not exists (select 1 from public.rh_actividades where nombre = 'Piscina');

insert into public.rh_actividades (nombre, icono, color, orden, activo)
select 'Restaurant', '🍽️', '#A78BFA', 12, true
where not exists (select 1 from public.rh_actividades where nombre = 'Restaurant');

insert into public.rh_actividades (nombre, icono, color, orden, activo)
select 'Runners Comida', '🏃', '#34D399', 13, true
where not exists (select 1 from public.rh_actividades where nombre = 'Runners Comida');

insert into public.rh_actividades (nombre, icono, color, orden, activo)
select 'Bartender', '🍹', '#EC4899', 14, true
where not exists (select 1 from public.rh_actividades where nombre = 'Bartender');

insert into public.rh_actividades (nombre, icono, color, orden, activo)
select 'Runner Bar', '🥂', '#F472B6', 15, true
where not exists (select 1 from public.rh_actividades where nombre = 'Runner Bar');
