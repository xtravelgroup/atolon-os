-- ============================================================================
-- Fase 6 Contratistas: Log de ingresos al muelle
-- Fecha: 2026-04-20
-- ============================================================================

-- Log de ingresos en muelle para contratistas
create table if not exists public.contratistas_ingresos_muelle (
  id uuid primary key default gen_random_uuid(),
  trabajador_id uuid references public.contratistas_trabajadores(id) on delete set null,
  contratista_id uuid references public.contratistas(id) on delete set null,
  cedula text,
  nombre text,
  codigo_certificado text,
  resultado text not null check (resultado in ('permitido','rechazado','advertencia')),
  motivo text,
  verificado_por text,
  created_at timestamptz default now()
);

create index if not exists idx_ingresos_muelle_fecha on public.contratistas_ingresos_muelle(created_at desc);
create index if not exists idx_ingresos_muelle_trabajador on public.contratistas_ingresos_muelle(trabajador_id);

alter table public.contratistas_ingresos_muelle enable row level security;

drop policy if exists "anon read" on public.contratistas_ingresos_muelle;
create policy "anon read" on public.contratistas_ingresos_muelle for select to anon using (true);

drop policy if exists "auth all" on public.contratistas_ingresos_muelle;
create policy "auth all" on public.contratistas_ingresos_muelle for all to authenticated using (true) with check (true);

-- Denormalizar último ingreso en trabajador
alter table public.contratistas_trabajadores add column if not exists ultimo_ingreso timestamptz;
