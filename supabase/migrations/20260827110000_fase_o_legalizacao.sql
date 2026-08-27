-- Módulo Legalização: controle de documentos de legalização por empresa
-- (Alvará de Funcionamento, Vigilância Sanitária, CNES, Certidão, ...),
-- cada um com data de vencimento e o arquivo digitalizado. Papel novo
-- (ANALISTA_LEGALIZACAO, ver fase_o_papeis_analistas) vê só este módulo.
--
-- Catálogo de tipos é configurável — staff/analista pode adicionar tipos
-- novos sem deploy. Nem toda empresa precisa de todo tipo (ex.: CNES só se
-- aplica a empresa de saúde): uma empresa sem necessidade de um tipo
-- simplesmente não tem linha em legalizacao_documentos pra ele, mesmo
-- padrão de certificates (nem toda empresa tem certificado, e tudo bem).
--
-- Arquivo vai pro Vercel Blob (blob_url/blob_pathname), não bytea no
-- Postgres — decisão tomada porque bytea (o padrão usado em certificates)
-- esbarra no limite prático de ~4,5MB por requisição de Serverless
-- Function da Vercel, que um documento escaneado pode ultrapassar.

create or replace function public.is_legalizacao_analista()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_companies
    where user_id = auth.uid() and role = 'ANALISTA_LEGALIZACAO'
  );
$$;

create table public.legalizacao_tipos_documento (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.legalizacao_tipos_documento is
  'Catálogo configurável dos tipos de documento de legalização. Inativar em vez de apagar quando já houver documentos desse tipo (on delete restrict em legalizacao_documentos.tipo_id).';

create table public.legalizacao_documentos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tipo_id uuid not null references public.legalizacao_tipos_documento(id) on delete restrict,
  data_vencimento date not null,
  blob_url text not null,
  blob_pathname text not null,
  nome_arquivo text not null,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, tipo_id)
);
comment on table public.legalizacao_documentos is
  'Um documento por empresa+tipo — upsert em (company_id, tipo_id) substitui o anterior (apagando o blob antigo), mesmo padrão de certificates. Empresa sem necessidade de um tipo não tem linha aqui.';

create index legalizacao_documentos_company_id_idx on public.legalizacao_documentos(company_id);
create index legalizacao_documentos_tipo_id_idx on public.legalizacao_documentos(tipo_id);

create trigger legalizacao_tipos_documento_set_updated_at before update on public.legalizacao_tipos_documento
  for each row execute function public.set_updated_at();
create trigger legalizacao_documentos_set_updated_at before update on public.legalizacao_documentos
  for each row execute function public.set_updated_at();

alter table public.legalizacao_tipos_documento enable row level security;
alter table public.legalizacao_documentos enable row level security;

-- Módulo é exclusivo de staff SOMA + analista de legalização — cliente
-- (ADMIN_CLIENTE/EMISSOR) nunca vê nem sabe que essas tabelas existem,
-- mesmo padrão de certificates.
create policy legalizacao_tipos_documento_all on public.legalizacao_tipos_documento
  for all using (public.is_soma_staff() or public.is_legalizacao_analista())
  with check (public.is_soma_staff() or public.is_legalizacao_analista());

create policy legalizacao_documentos_all on public.legalizacao_documentos
  for all using (public.is_soma_staff() or public.is_legalizacao_analista())
  with check (public.is_soma_staff() or public.is_legalizacao_analista());

-- Catálogo inicial (exemplos dados pelo usuário) — dá pra adicionar mais
-- depois pela tela de Tipos de documento, sem precisar de deploy.
insert into public.legalizacao_tipos_documento (nome) values
  ('Alvará de Funcionamento'),
  ('Vigilância Sanitária'),
  ('CNES'),
  ('Certidão');
