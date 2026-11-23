-- Fase CM — SEI: arquivar processos (cliente saiu etc.: some das listas e a
-- extensão não abre mais no SEI) e cobertura dos clientes de Petrópolis
-- (todo cliente ativo deve ter processo no SEI ou uma dispensa conferida).
-- Spec: docs/sei.md.

alter table public.sei_processos
  add column if not exists arquivado_em timestamptz,
  add column if not exists arquivado_por uuid references public.profiles(id) on delete set null,
  add column if not exists motivo_arquivamento text;

create table if not exists public.sei_cobertura_dispensas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  motivo text not null check (motivo in
    ('PONTO_REFERENCIA', 'SEM_ATENDIMENTO_LOCAL', 'ATIVIDADE_DISPENSADA', 'PROCESSO_FORA_SEI', 'OUTRO')),
  observacao text,
  criado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.sei_cobertura_dispensas enable row level security;
drop policy if exists sei_cobertura_dispensas_select on public.sei_cobertura_dispensas;
create policy sei_cobertura_dispensas_select on public.sei_cobertura_dispensas
  for select using ((select public.tem_permissao('legalizacao.ver')));
drop policy if exists sei_cobertura_dispensas_write on public.sei_cobertura_dispensas;
create policy sei_cobertura_dispensas_write on public.sei_cobertura_dispensas
  for all using ((select public.tem_permissao('legalizacao.editar')))
  with check ((select public.tem_permissao('legalizacao.editar')));
