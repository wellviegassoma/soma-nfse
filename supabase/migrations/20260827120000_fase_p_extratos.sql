-- Módulo Extratos: cadastro de contas bancárias por empresa + controle mês
-- a mês de entrega do extrato bancário pra equipe contábil, com o arquivo
-- do extrato anexado por mês. Papel novo (ANALISTA_CONTABIL, ver
-- fase_o_papeis_analistas) vê só este módulo.
--
-- Mesmo padrão bytea-fora-do-Postgres do módulo Legalização (ver
-- fase_o_legalizacao): arquivo vai pro Vercel Blob (blob_url/blob_pathname).
--
-- "entregue" é independente do arquivo — dá pra marcar como recebido (ex.:
-- mandado por WhatsApp) antes do upload ficar pronto no sistema.

create or replace function public.is_extratos_analista()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_companies
    where user_id = auth.uid() and role = 'ANALISTA_CONTABIL'
  );
$$;

create table public.extrato_contas_bancarias (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  banco text not null,
  agencia text not null,
  conta text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.extrato_contas_bancarias is
  'Cadastro de contas bancárias por empresa, usado pra controlar a entrega mensal de extrato (ver extratos_mensais). Inativar em vez de apagar uma conta encerrada que já tem extratos.';
create index extrato_contas_bancarias_company_id_idx on public.extrato_contas_bancarias(company_id);

create table public.extratos_mensais (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.extrato_contas_bancarias(id) on delete cascade,
  competencia text not null,
  entregue boolean not null default false,
  blob_url text,
  blob_pathname text,
  nome_arquivo text,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conta_id, competencia)
);
comment on table public.extratos_mensais is
  'Controle mensal de entrega de extrato por conta bancária. competencia no formato YYYY-MM. "entregue" é independente do arquivo.';
create index extratos_mensais_conta_id_idx on public.extratos_mensais(conta_id);

create trigger extrato_contas_bancarias_set_updated_at before update on public.extrato_contas_bancarias
  for each row execute function public.set_updated_at();
create trigger extratos_mensais_set_updated_at before update on public.extratos_mensais
  for each row execute function public.set_updated_at();

alter table public.extrato_contas_bancarias enable row level security;
alter table public.extratos_mensais enable row level security;

create policy extrato_contas_bancarias_all on public.extrato_contas_bancarias
  for all using (public.is_soma_staff() or public.is_extratos_analista())
  with check (public.is_soma_staff() or public.is_extratos_analista());

create policy extratos_mensais_all on public.extratos_mensais
  for all using (public.is_soma_staff() or public.is_extratos_analista())
  with check (public.is_soma_staff() or public.is_extratos_analista());
