-- Nem toda empresa precisa controlar todo tipo de documento do catálogo
-- (ex.: CNES só faz sentido pra empresa de saúde). Em vez de guardar
-- "quais tipos se aplicam" (o que exigiria criar uma linha por empresa x
-- tipo já no cadastro), guardamos só as EXCEÇÕES: a ausência de linha aqui
-- significa "esse tipo se aplica normalmente a essa empresa" (comportamento
-- padrão, sem migração de dados necessária pras empresas já existentes).
create table public.legalizacao_tipos_nao_aplicaveis (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tipo_id uuid not null references public.legalizacao_tipos_documento(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (company_id, tipo_id)
);

create index idx_legalizacao_tipos_nao_aplicaveis_company on public.legalizacao_tipos_nao_aplicaveis(company_id);
create index idx_legalizacao_tipos_nao_aplicaveis_tipo on public.legalizacao_tipos_nao_aplicaveis(tipo_id);

alter table public.legalizacao_tipos_nao_aplicaveis enable row level security;

create policy legalizacao_tipos_nao_aplicaveis_all on public.legalizacao_tipos_nao_aplicaveis
  for all
  using (public.is_soma_staff() or public.is_legalizacao_analista())
  with check (public.is_soma_staff() or public.is_legalizacao_analista());
