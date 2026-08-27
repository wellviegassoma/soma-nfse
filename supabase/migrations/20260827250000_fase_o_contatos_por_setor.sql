-- Cadastro geral do cliente ganha contato por setor (Pessoal, Fiscal,
-- Financeiro etc.) — telefone/e-mail de quem recebe cada tipo de assunto,
-- pra não depender de descobrir isso de memória a cada contato. Gerenciado
-- só pela SOMA, mesmo padrão de acesso de `certificates`/`services_write`.

create table public.company_contatos_setor (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  setor text not null,
  nome text,
  telefone text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index company_contatos_setor_company_id_idx on public.company_contatos_setor(company_id);

create trigger company_contatos_setor_set_updated_at before update on public.company_contatos_setor
  for each row execute function public.set_updated_at();

alter table public.company_contatos_setor enable row level security;

create policy company_contatos_setor_all on public.company_contatos_setor
  for all using (public.is_soma_staff()) with check (public.is_soma_staff());
