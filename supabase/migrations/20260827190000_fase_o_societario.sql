-- Módulo Societário: contrato social + alterações da empresa, e sócios
-- (PF ou PJ) com seus próprios documentos. Diferente de Legalização —
-- nenhum documento aqui tem vencimento nem catálogo fixo de tipos; é um
-- histórico que cresce livremente. Reaproveita o papel ANALISTA_LEGALIZACAO
-- já existente (nenhum papel novo necessário).

create table public.societario_documentos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  data_documento date not null,
  descricao text not null,
  blob_url text not null,
  blob_pathname text not null,
  nome_arquivo text not null,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_societario_documentos_company on public.societario_documentos(company_id);

create table public.socios (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tipo_pessoa text not null check (tipo_pessoa in ('PF', 'PJ')),
  nome text not null,
  documento text,
  percentual_participacao numeric(5,2) check (percentual_participacao between 0 and 100),
  data_entrada date,
  data_saida date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_socios_company on public.socios(company_id);

create table public.socios_documentos (
  id uuid primary key default gen_random_uuid(),
  socio_id uuid not null references public.socios(id) on delete cascade,
  descricao text not null,
  blob_url text not null,
  blob_pathname text not null,
  nome_arquivo text not null,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_socios_documentos_socio on public.socios_documentos(socio_id);

create trigger societario_documentos_set_updated_at before update on public.societario_documentos
  for each row execute function public.set_updated_at();
create trigger socios_set_updated_at before update on public.socios
  for each row execute function public.set_updated_at();
create trigger socios_documentos_set_updated_at before update on public.socios_documentos
  for each row execute function public.set_updated_at();

alter table public.societario_documentos enable row level security;
alter table public.socios enable row level security;
alter table public.socios_documentos enable row level security;

create policy societario_documentos_all on public.societario_documentos
  for all
  using (public.is_soma_staff() or public.is_legalizacao_analista())
  with check (public.is_soma_staff() or public.is_legalizacao_analista());

create policy socios_all on public.socios
  for all
  using (public.is_soma_staff() or public.is_legalizacao_analista())
  with check (public.is_soma_staff() or public.is_legalizacao_analista());

create policy socios_documentos_all on public.socios_documentos
  for all
  using (public.is_soma_staff() or public.is_legalizacao_analista())
  with check (public.is_soma_staff() or public.is_legalizacao_analista());
