-- Fase B — Fiscal: cadastro fiscal da empresa, certificado digital, serviços, tomadores.

create type public.tax_regime as enum (
  'SIMPLES_NACIONAL',
  'LUCRO_PRESUMIDO',
  'LUCRO_REAL'
);

create type public.nfse_ambiente as enum (
  'HOMOLOGACAO',
  'PRODUCAO'
);

create type public.customer_type as enum ('PF', 'PJ');

-- ---------------------------------------------------------------------------
-- companies: dados fiscais + configuração de emissão
-- ---------------------------------------------------------------------------

alter table public.companies
  add column municipal_registration text,
  add column tax_regime public.tax_regime,
  add column cnae text,
  add column municipality_ibge_code text,
  add column nfse_ambiente public.nfse_ambiente not null default 'HOMOLOGACAO',
  add column dps_series text not null default '1',
  add column dps_next_number integer not null default 1;

comment on column public.companies.nfse_ambiente is
  'Trava também aplicada no backend (Fase C) — nunca confiar só na tela.';

-- ---------------------------------------------------------------------------
-- certificates: um certificado A1 ativo por empresa. Só a SOMA acessa (RLS
-- abaixo) — o cliente nunca vê nem sabe que essa tabela existe (ver
-- docs/spec.md). Conteúdo cifrado com AES-256-GCM usando MASTER_ENCRYPTION_KEY
-- (variável só do servidor) antes de chegar ao banco; o Postgres nunca vê o
-- .pfx nem a senha em claro.
-- ---------------------------------------------------------------------------

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  encrypted_file bytea not null,
  encrypted_password bytea not null,
  fingerprint text not null,
  expires_at timestamptz not null,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger certificates_set_updated_at before update on public.certificates
  for each row execute function public.set_updated_at();

alter table public.certificates enable row level security;

create policy certificates_all on public.certificates
  for all using (public.is_soma_staff()) with check (public.is_soma_staff());

-- ---------------------------------------------------------------------------
-- services: catálogo por empresa. A SOMA cadastra com os dados fiscais
-- completos; o cliente só deveria consultar name/description/active — isso é
-- responsabilidade da query (SELECT explícito, nunca "select *"), já que RLS
-- é por linha, não por coluna.
-- ---------------------------------------------------------------------------

create table public.services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  national_tax_code text,
  municipal_tax_code text,
  nbs text,
  iss_rate numeric(5, 2),
  taxation_type text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index services_company_id_idx on public.services(company_id);

create trigger services_set_updated_at before update on public.services
  for each row execute function public.set_updated_at();

alter table public.services enable row level security;

create policy services_select on public.services
  for select using (
    public.is_soma_staff() or public.user_company_role(company_id) is not null
  );
create policy services_write on public.services
  for all using (public.is_soma_staff()) with check (public.is_soma_staff());

-- ---------------------------------------------------------------------------
-- customers (tomadores): cadastrados pela própria clínica.
-- ---------------------------------------------------------------------------

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  type public.customer_type not null,
  cpf_cnpj text,
  name text not null,
  email text,
  zip_code text,
  address text,
  number text,
  complement text,
  district text,
  city text,
  state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_company_id_idx on public.customers(company_id);
create unique index customers_company_cpf_cnpj_idx on public.customers(company_id, cpf_cnpj)
  where cpf_cnpj is not null;

create trigger customers_set_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

alter table public.customers enable row level security;

create policy customers_all on public.customers
  for all using (
    public.is_soma_staff() or public.user_company_role(company_id) is not null
  ) with check (
    public.is_soma_staff() or public.user_company_role(company_id) is not null
  );
