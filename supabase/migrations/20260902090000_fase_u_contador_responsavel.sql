-- Fase U (continuação) — dados do contador responsável da SOMA usados em
-- toda declaração do MIT (bloco ResponsavelApuracao do ENCAPURACAO314).
-- Substitui a ideia original de guardar isso em env var do serviço
-- integra-contador/ (Railway) — decisão do usuário: configurável dentro
-- do próprio app, só por SUPER_ADMIN, valendo pra todas as empresas (é
-- um dado só, do contador, não da empresa cliente).

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_companies
    where user_id = auth.uid() and role = 'SUPER_ADMIN'
  );
$$;

-- Tabela de linha única (singleton) — sempre a mesma id fixa, pra não
-- precisar de lógica extra pra "achar a única linha que existe".
create table public.configuracao_contador_responsavel (
  id uuid primary key default '00000000-0000-0000-0000-000000000001',
  cpf text,
  crc_uf text,
  crc_numero text,
  telefone_ddd text,
  telefone_numero text,
  email text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint configuracao_contador_responsavel_singleton
    check (id = '00000000-0000-0000-0000-000000000001')
);

create trigger configuracao_contador_responsavel_set_updated_at
  before update on public.configuracao_contador_responsavel
  for each row execute function public.set_updated_at();

alter table public.configuracao_contador_responsavel enable row level security;

-- Leitura: qualquer staff SOMA (precisa pra declarar o MIT de qualquer
-- empresa). Escrita: só SUPER_ADMIN.
create policy configuracao_contador_responsavel_select on public.configuracao_contador_responsavel
  for select using (public.is_soma_staff());

create policy configuracao_contador_responsavel_insert on public.configuracao_contador_responsavel
  for insert with check (public.is_super_admin());

create policy configuracao_contador_responsavel_update on public.configuracao_contador_responsavel
  for update using (public.is_super_admin()) with check (public.is_super_admin());
