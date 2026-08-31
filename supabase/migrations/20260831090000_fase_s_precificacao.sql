-- Fase S — Precificação: calculadora de custo/margem por procedimento para
-- clientes profissionais de saúde (odontologia, fisioterapia, estética etc.).
-- Reaproveita public.companies como tenant — cada empresa tem seu próprio
-- catálogo de insumos, procedimentos e parâmetros de custo fixo. Equipe SOMA
-- e o próprio cliente (qualquer role vinculada à empresa) podem editar —
-- ferramenta de uso conjunto, não só consulta.

-- ---------------------------------------------------------------------------
-- precificacao_parametros: 1 linha por empresa — carga horária + alíquotas
-- usadas no rateio de custo fixo por hora e no cálculo de margem.
-- ---------------------------------------------------------------------------

create table public.precificacao_parametros (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  carga_horaria_mensal numeric not null default 0,
  aliquota_imposto numeric not null default 0,
  taxa_cartao numeric not null default 0,
  desconto_padrao numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger precificacao_parametros_set_updated_at
  before update on public.precificacao_parametros
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- precificacao_custos_fixos: linhas de custo fixo mensal (aluguel, luz,
-- internet, pró-labore, marketing etc.) somadas e rateadas pela carga
-- horária mensal em precificacao_parametros.
-- ---------------------------------------------------------------------------

create table public.precificacao_custos_fixos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  descricao text not null,
  valor_mensal numeric not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger precificacao_custos_fixos_set_updated_at
  before update on public.precificacao_custos_fixos
  for each row execute function public.set_updated_at();

create index precificacao_custos_fixos_company_id_idx on public.precificacao_custos_fixos(company_id);

-- ---------------------------------------------------------------------------
-- precificacao_insumos: catálogo de materiais. custo por uso = valor_compra /
-- quantidade_por_compra, calculado na aplicação (não guardado aqui).
-- ---------------------------------------------------------------------------

create table public.precificacao_insumos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nome text not null,
  unidade_compra text,
  quantidade_por_compra numeric not null default 1,
  valor_compra numeric not null default 0,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger precificacao_insumos_set_updated_at
  before update on public.precificacao_insumos
  for each row execute function public.set_updated_at();

create index precificacao_insumos_company_id_idx on public.precificacao_insumos(company_id);

-- ---------------------------------------------------------------------------
-- precificacao_procedimentos: serviços/procedimentos oferecidos.
-- ---------------------------------------------------------------------------

create table public.precificacao_procedimentos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
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

create trigger precificacao_procedimentos_set_updated_at
  before update on public.precificacao_procedimentos
  for each row execute function public.set_updated_at();

create index precificacao_procedimentos_company_id_idx on public.precificacao_procedimentos(company_id);

-- ---------------------------------------------------------------------------
-- precificacao_procedimento_insumos: receita (BOM) — quais insumos e em que
-- quantidade compõem o custo de material de cada procedimento.
-- ---------------------------------------------------------------------------

create table public.precificacao_procedimento_insumos (
  id uuid primary key default gen_random_uuid(),
  procedimento_id uuid not null references public.precificacao_procedimentos(id) on delete cascade,
  insumo_id uuid not null references public.precificacao_insumos(id) on delete restrict,
  quantidade numeric not null default 0,
  created_at timestamptz not null default now()
);

create index precificacao_procedimento_insumos_procedimento_id_idx
  on public.precificacao_procedimento_insumos(procedimento_id);
create index precificacao_procedimento_insumos_insumo_id_idx
  on public.precificacao_procedimento_insumos(insumo_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — mesmo padrão do resto do soma-nfse: staff SOMA vê/edita
-- tudo; qualquer usuário vinculado à empresa (user_company_role) também edita
-- (equipe e cliente usam a mesma ferramenta lado a lado).
-- ---------------------------------------------------------------------------

alter table public.precificacao_parametros enable row level security;
alter table public.precificacao_custos_fixos enable row level security;
alter table public.precificacao_insumos enable row level security;
alter table public.precificacao_procedimentos enable row level security;
alter table public.precificacao_procedimento_insumos enable row level security;

create policy precificacao_parametros_all on public.precificacao_parametros
  for all using (
    public.is_soma_staff() or public.user_company_role(company_id) is not null
  ) with check (
    public.is_soma_staff() or public.user_company_role(company_id) is not null
  );

create policy precificacao_custos_fixos_all on public.precificacao_custos_fixos
  for all using (
    public.is_soma_staff() or public.user_company_role(company_id) is not null
  ) with check (
    public.is_soma_staff() or public.user_company_role(company_id) is not null
  );

create policy precificacao_insumos_all on public.precificacao_insumos
  for all using (
    public.is_soma_staff() or public.user_company_role(company_id) is not null
  ) with check (
    public.is_soma_staff() or public.user_company_role(company_id) is not null
  );

create policy precificacao_procedimentos_all on public.precificacao_procedimentos
  for all using (
    public.is_soma_staff() or public.user_company_role(company_id) is not null
  ) with check (
    public.is_soma_staff() or public.user_company_role(company_id) is not null
  );

-- procedimento_insumos não tem company_id direto — deriva da procedimento pai.
create policy precificacao_procedimento_insumos_all on public.precificacao_procedimento_insumos
  for all using (
    exists (
      select 1 from public.precificacao_procedimentos p
      where p.id = procedimento_id
        and (public.is_soma_staff() or public.user_company_role(p.company_id) is not null)
    )
  ) with check (
    exists (
      select 1 from public.precificacao_procedimentos p
      where p.id = procedimento_id
        and (public.is_soma_staff() or public.user_company_role(p.company_id) is not null)
    )
  );
