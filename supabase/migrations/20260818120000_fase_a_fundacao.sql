-- Fase A — Fundação: usuários, multiempresa, empresas.
-- Hierarquia: organizations (tenant, ex.: "Clínica ABC") -> companies (um ou mais
-- CNPJs por organization) -> user_companies (acesso do usuário a uma company, com papel).
-- A própria SOMA existe como uma organization/company especial; SUPER_ADMIN/ADMIN_SOMA
-- são papéis atribuídos via user_companies apontando para a company da SOMA.

create extension if not exists "pgcrypto";

create type public.user_role as enum (
  'SUPER_ADMIN',
  'ADMIN_SOMA',
  'ADMIN_CLIENTE',
  'EMISSOR'
);

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.organizations is 'Tenant do SaaS: a SOMA em si, e cada cliente (ex.: Clínica ABC).';

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cnpj text unique,
  legal_name text not null,
  trade_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.companies is 'Um CNPJ (matriz ou filial) dentro de uma organization.';
create index companies_organization_id_idx on public.companies(organization_id);

-- Espelha auth.users com dados de perfil (nunca senha — isso é do Supabase Auth).
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'Perfil público do usuário autenticado. Nunca armazena senha.';

create table public.user_companies (
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role public.user_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, company_id)
);
comment on table public.user_companies is 'Vínculo do usuário a uma empresa, com papel. Base do isolamento multiempresa.';
create index user_companies_company_id_idx on public.user_companies(company_id);

-- ---------------------------------------------------------------------------
-- Funções auxiliares (SECURITY DEFINER: evita recursão de RLS ao consultar
-- user_companies de dentro da própria policy de user_companies).
-- ---------------------------------------------------------------------------

create or replace function public.user_company_role(target_company_id uuid)
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.user_companies
  where user_id = auth.uid() and company_id = target_company_id
  limit 1;
$$;

create or replace function public.is_soma_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_companies
    where user_id = auth.uid()
      and role in ('SUPER_ADMIN', 'ADMIN_SOMA')
  );
$$;

create or replace function public.shares_company_with(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_companies mine
    join public.user_companies theirs on theirs.company_id = mine.company_id
    where mine.user_id = auth.uid()
      and theirs.user_id = target_user_id
  );
$$;

-- Cria o profile automaticamente quando um usuário se cadastra no Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at automático
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger companies_set_updated_at before update on public.companies
  for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.user_companies enable row level security;

-- organizations: SOMA vê tudo; cliente vê só a organization das companies às quais tem acesso.
create policy organizations_select on public.organizations
  for select using (
    public.is_soma_staff()
    or exists (
      select 1 from public.companies c
      where c.organization_id = organizations.id
        and public.user_company_role(c.id) is not null
    )
  );
create policy organizations_insert on public.organizations
  for insert with check (public.is_soma_staff());
create policy organizations_update on public.organizations
  for update using (public.is_soma_staff()) with check (public.is_soma_staff());
create policy organizations_delete on public.organizations
  for delete using (public.is_soma_staff());

-- companies: SOMA vê tudo; usuário vê só as companies às quais está vinculado.
create policy companies_select on public.companies
  for select using (
    public.is_soma_staff() or public.user_company_role(id) is not null
  );
create policy companies_insert on public.companies
  for insert with check (public.is_soma_staff());
create policy companies_update on public.companies
  for update using (public.is_soma_staff()) with check (public.is_soma_staff());
create policy companies_delete on public.companies
  for delete using (public.is_soma_staff());

-- profiles: o próprio usuário, SOMA, ou quem divide empresa com ele (para telas de gestão de usuários).
create policy profiles_select on public.profiles
  for select using (
    id = auth.uid() or public.is_soma_staff() or public.shares_company_with(id)
  );
create policy profiles_update on public.profiles
  for update using (id = auth.uid() or public.is_soma_staff())
  with check (id = auth.uid() or public.is_soma_staff());

-- user_companies: o próprio vínculo; SOMA gerencia tudo; Admin Cliente gerencia
-- usuários da própria empresa (spec: "Administrador Cliente: gerencia usuários da própria empresa").
create policy user_companies_select on public.user_companies
  for select using (
    user_id = auth.uid() or public.is_soma_staff() or public.shares_company_with(user_id)
  );
create policy user_companies_insert on public.user_companies
  for insert with check (
    public.is_soma_staff() or public.user_company_role(company_id) = 'ADMIN_CLIENTE'
  );
create policy user_companies_update on public.user_companies
  for update using (
    public.is_soma_staff() or public.user_company_role(company_id) = 'ADMIN_CLIENTE'
  ) with check (
    public.is_soma_staff() or public.user_company_role(company_id) = 'ADMIN_CLIENTE'
  );
create policy user_companies_delete on public.user_companies
  for delete using (
    public.is_soma_staff() or public.user_company_role(company_id) = 'ADMIN_CLIENTE'
  );
