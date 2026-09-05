-- Fase Z — Login próprio no ISS de Petrópolis por empresa. Várias
-- empresas têm login e senha próprios no site da Prefeitura (em vez de
-- entrar pelo login único do escritório e escolher o cliente na lista).
-- Quando não houver linha aqui pra uma empresa, o backend continua
-- usando o login do escritório (PETROPOLIS_LOGIN_ISS/PETROPOLIS_SENHA_MD5).
create table public.petropolis_credenciais (
  company_id uuid primary key references public.companies(id) on delete cascade,
  login text not null,
  encrypted_senha bytea not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger petropolis_credenciais_set_updated_at before update on public.petropolis_credenciais
  for each row execute function public.set_updated_at();

alter table public.petropolis_credenciais enable row level security;

create policy petropolis_credenciais_all on public.petropolis_credenciais
  for all using (public.is_soma_staff()) with check (public.is_soma_staff());
