-- Fase T — Modelos de Precificação: biblioteca de catálogos prontos
-- ("SOMA Odontologia", "SOMA Medicina" etc.), mantida pela equipe SOMA, que
-- qualquer empresa pode importar com um clique pro próprio catálogo
-- (cópia editável — não fica linkado ao modelo depois de importado).
-- Modelos não são escopados por company_id — são uma biblioteca global.

create table public.precificacao_modelos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  especialidade text,
  descricao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger precificacao_modelos_set_updated_at
  before update on public.precificacao_modelos
  for each row execute function public.set_updated_at();

create table public.precificacao_modelo_insumos (
  id uuid primary key default gen_random_uuid(),
  modelo_id uuid not null references public.precificacao_modelos(id) on delete cascade,
  nome text not null,
  unidade_compra text,
  quantidade_por_compra numeric not null default 1,
  valor_compra numeric not null default 0,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger precificacao_modelo_insumos_set_updated_at
  before update on public.precificacao_modelo_insumos
  for each row execute function public.set_updated_at();

create index precificacao_modelo_insumos_modelo_id_idx on public.precificacao_modelo_insumos(modelo_id);

create table public.precificacao_modelo_procedimentos (
  id uuid primary key default gen_random_uuid(),
  modelo_id uuid not null references public.precificacao_modelos(id) on delete cascade,
  nome text not null,
  especialidade text,
  tempo_atendimento_horas numeric not null default 0,
  preco_venda numeric not null default 0,
  custo_laboratorio numeric not null default 0,
  honorario_profissional_fixo numeric not null default 0,
  percentual_retrabalho numeric not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger precificacao_modelo_procedimentos_set_updated_at
  before update on public.precificacao_modelo_procedimentos
  for each row execute function public.set_updated_at();

create index precificacao_modelo_procedimentos_modelo_id_idx on public.precificacao_modelo_procedimentos(modelo_id);

-- Receita (BOM) por procedimento do modelo — schema pronto desde já pra não
-- exigir nova migration quando um modelo futuro (ex. SOMA Medicina, ou uma
-- revisão do Odontologia) vier com receita; o Odontologia inicial não usa
-- esta tabela (decidido: só insumos + procedimentos por ora).
create table public.precificacao_modelo_procedimento_insumos (
  id uuid primary key default gen_random_uuid(),
  modelo_procedimento_id uuid not null references public.precificacao_modelo_procedimentos(id) on delete cascade,
  modelo_insumo_id uuid not null references public.precificacao_modelo_insumos(id) on delete restrict,
  quantidade numeric not null default 0,
  created_at timestamptz not null default now()
);

create index precificacao_modelo_procedimento_insumos_procedimento_idx
  on public.precificacao_modelo_procedimento_insumos(modelo_procedimento_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — biblioteca é lida por qualquer usuário logado (staff
-- ou cliente, de qualquer empresa), mas só a equipe SOMA cria/edita/apaga.
-- ---------------------------------------------------------------------------

alter table public.precificacao_modelos enable row level security;
alter table public.precificacao_modelo_insumos enable row level security;
alter table public.precificacao_modelo_procedimentos enable row level security;
alter table public.precificacao_modelo_procedimento_insumos enable row level security;

create policy precificacao_modelos_select on public.precificacao_modelos
  for select using (auth.uid() is not null);
create policy precificacao_modelos_write on public.precificacao_modelos
  for all using (public.is_soma_staff()) with check (public.is_soma_staff());

create policy precificacao_modelo_insumos_select on public.precificacao_modelo_insumos
  for select using (auth.uid() is not null);
create policy precificacao_modelo_insumos_write on public.precificacao_modelo_insumos
  for all using (public.is_soma_staff()) with check (public.is_soma_staff());

create policy precificacao_modelo_procedimentos_select on public.precificacao_modelo_procedimentos
  for select using (auth.uid() is not null);
create policy precificacao_modelo_procedimentos_write on public.precificacao_modelo_procedimentos
  for all using (public.is_soma_staff()) with check (public.is_soma_staff());

create policy precificacao_modelo_procedimento_insumos_select on public.precificacao_modelo_procedimento_insumos
  for select using (auth.uid() is not null);
create policy precificacao_modelo_procedimento_insumos_write on public.precificacao_modelo_procedimento_insumos
  for all using (public.is_soma_staff()) with check (public.is_soma_staff());
