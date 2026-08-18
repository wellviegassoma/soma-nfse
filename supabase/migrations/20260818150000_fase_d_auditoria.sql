-- Fase D — Auditoria: trilha de quem fez o quê, quando. Só a SOMA lê;
-- escrita só pelo service role (nunca por RLS de usuário comum — ver
-- frontend/src/lib/audit.ts), pra não virar um log editável pelo próprio
-- usuário que está sendo auditado.

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index audit_logs_company_id_idx on public.audit_logs(company_id);
create index audit_logs_created_at_idx on public.audit_logs(created_at desc);

alter table public.audit_logs enable row level security;

create policy audit_logs_select on public.audit_logs
  for select using (public.is_soma_staff());
