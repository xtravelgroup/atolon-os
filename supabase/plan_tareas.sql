-- Módulo Plan / Cronograma — Plan de integración Atolón → Grupo Las Américas
create table if not exists plan_tareas (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,             -- ID de la hoja (GOB-01)
  area_cod text,                           -- código de área (GOB)
  area text,                               -- nombre del área
  titulo text not null,
  descripcion text default '',
  responsable text default '',
  fecha_inicio date,
  fecha_fin date,
  duracion int,
  semana_inicio int,
  dependencias text[] default '{}',        -- códigos de tareas predecesoras
  entregable text default '',
  prioridad text default 'Media',          -- Crítica | Alta | Media | Baja
  estado text default 'Pendiente',         -- Pendiente | En curso | Completada | Bloqueada
  avance int default 0,                    -- 0..100
  comentarios text default '',
  orden int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists plan_tareas_area_idx on plan_tareas(area_cod);
create index if not exists plan_tareas_estado_idx on plan_tareas(estado);
alter table plan_tareas enable row level security;
drop policy if exists "plan_tareas_all" on plan_tareas;
create policy "plan_tareas_all" on plan_tareas for all to anon, authenticated using (true) with check (true);
grant all on plan_tareas to anon, authenticated;
