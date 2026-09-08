-- Fase AA — Módulo Financeiro, fundação (ver docs/financeiro.md).
-- Substitui o Nibo Gestão Financeira. Módulo no mesmo padrão de Legalização e
-- Extratos (rota própria, papel próprio, RLS própria), com uma diferença
-- importante de segurança: naqueles dois módulos o cliente NUNCA entra, então
-- a policy é grosseira (is_soma_staff() or is_<modulo>_analista(), sem recorte
-- por empresa). Aqui o cliente entra e vê o próprio dinheiro — toda policy é
-- recortada por company_id via user_company_role(), no mesmo padrão das
-- tabelas fiscais (services, dps, nfse).
--
-- Esta migration entrega só os cadastros (F1). Agendamentos, lançamentos,
-- extrato e conciliação vêm nas fases seguintes.

-- ---------------------------------------------------------------------------
-- Papel
-- ---------------------------------------------------------------------------

create or replace function public.is_financeiro_analista()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_companies
    where user_id = auth.uid() and role = 'ANALISTA_FINANCEIRO'
  );
$$;

-- Mesmo bug já corrigido em fase_o_analistas_veem_empresas: sem isso o
-- ANALISTA_FINANCEIRO não enxerga NENHUMA empresa em `companies` e o módulo
-- fica inutilizável (não tem como listar nem abrir empresa).
alter policy companies_select on public.companies
  using (
    public.is_soma_staff()
    or public.user_company_role(id) is not null
    or public.is_legalizacao_analista()
    or public.is_extratos_analista()
    or public.is_financeiro_analista()
  );

-- Quem pode operar o financeiro DE UMA empresa: staff SOMA, analista
-- financeiro, e o ADMIN_CLIENTE da própria empresa. EMISSOR (recepção de
-- clínica, que só emite nota) fica de fora de propósito — não deve ver
-- saldo, fornecedor nem folha.
create or replace function public.pode_financeiro(target_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_soma_staff()
      or public.is_financeiro_analista()
      or public.user_company_role(target_company_id) = 'ADMIN_CLIENTE';
$$;

-- ---------------------------------------------------------------------------
-- Conta bancária: extrato_contas_bancarias vira o cadastro canônico
--
-- Decisão registrada em docs/financeiro.md: não existe fin_contas. A conta
-- bancária é o mesmo objeto do mundo real nos dois módulos — duplicar faria o
-- cliente digitar o mesmo banco duas vezes e faria a conciliação contábil do
-- módulo Extratos olhar pra uma conta diferente da que o financeiro movimenta.
-- ---------------------------------------------------------------------------

alter table public.extrato_contas_bancarias
  add column tipo text not null default 'CORRENTE'
    check (tipo in ('CORRENTE', 'POUPANCA', 'CAIXA', 'APLICACAO')),
  add column saldo_inicial numeric(14, 2) not null default 0,
  add column data_saldo_inicial date;

comment on column public.extrato_contas_bancarias.tipo is
  'Tipo da conta. CAIXA é dinheiro em espécie (sem banco/agência reais) — o financeiro precisa dele, o controle de entrega de extrato não.';
comment on column public.extrato_contas_bancarias.saldo_inicial is
  'Saldo de abertura na data_saldo_inicial. Todo saldo calculado parte daqui + lançamentos posteriores; sem isso o saldo do sistema nunca bate com o do banco.';

-- Cliente passa a enxergar as próprias contas (antes: só staff SOMA e
-- analista contábil, porque o módulo Extratos é interno). O recorte por
-- empresa vem de pode_financeiro(); is_extratos_analista() continua com
-- acesso amplo, como já era.
alter policy extrato_contas_bancarias_all on public.extrato_contas_bancarias
  using (public.is_extratos_analista() or public.pode_financeiro(company_id))
  with check (public.is_extratos_analista() or public.pode_financeiro(company_id));

-- extratos_mensais (controle de ENTREGA do extrato pro setor contábil) segue
-- interno de propósito: é rotina da SOMA, não do cliente. Não mexer.

-- ---------------------------------------------------------------------------
-- fin_contatos — cliente, fornecedor, funcionário, sócio
--
-- O Nibo separa em 4 telas, mas é uma entidade só com tipo. Fica separada de
-- `customers` (os tomadores da NFS-e) e de `socios` (societário) porque os
-- ciclos de vida são diferentes: um fornecedor nunca vira tomador de nota, e um
-- sócio do quadro societário não é necessariamente quem recebe pró-labore.
-- customer_id liga os dois quando for a mesma pessoa, sem forçar a fusão.
-- ---------------------------------------------------------------------------

create table public.fin_contatos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tipo text not null check (tipo in ('CLIENTE', 'FORNECEDOR', 'FUNCIONARIO', 'SOCIO')),
  nome text not null,
  cpf_cnpj text,
  email text,
  telefone text,
  observacoes text,
  customer_id uuid references public.customers(id) on delete set null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.fin_contatos is
  'Clientes, fornecedores, funcionários e sócios do financeiro da empresa. Um mesmo CPF/CNPJ pode aparecer com mais de um tipo (o contador que é fornecedor e o sócio que também é funcionário), por isso não há unique em (company_id, cpf_cnpj).';

create index fin_contatos_company_id_idx on public.fin_contatos(company_id);
create index fin_contatos_company_tipo_idx on public.fin_contatos(company_id, tipo);

-- ---------------------------------------------------------------------------
-- fin_categorias — plano gerencial (DFC), não plano de contas contábil
--
-- Por empresa, e o cliente também edita (decisão de 07/09/2026): cada empresa
-- nasce com o plano padrão via fin_seed_categorias_padrao() e a partir daí SOMA
-- e cliente mexem no mesmo plano. As de `sistema` ficam travadas porque juros,
-- multa, desconto e retenção são preenchidos pelo próprio cálculo do
-- lançamento — se o usuário apagar, o lançamento não tem onde cair.
--
-- conta_contabil é o gancho pro plano de contas da contabilidade: preenchido,
-- o gerencial do cliente vira lançamento contábil sem retrabalho. É o que o
-- Nibo não faz.
-- ---------------------------------------------------------------------------

create table public.fin_categorias (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  grupo text not null check (grupo in (
    'RECEITA_OPERACIONAL',
    'CUSTO_DESPESA_OPERACIONAL',
    'INVESTIMENTO',
    'FINANCIAMENTO'
  )),
  nome text not null,
  natureza text not null check (natureza in ('ENTRADA', 'SAIDA')),
  sistema boolean not null default false,
  codigo_sistema text,
  conta_contabil text,
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, nome)
);
comment on table public.fin_categorias is
  'Plano de categorias gerencial por empresa, estruturado como DFC (4 grupos). Editável pela SOMA e pelo cliente, exceto as linhas com sistema = true.';
comment on column public.fin_categorias.codigo_sistema is
  'Identificador estável das categorias de sistema (JUROS_RECEBIDOS, IRRF_RETIDO, ...) — o código busca por ele, nunca pelo nome, que o usuário pode renomear.';
comment on column public.fin_categorias.conta_contabil is
  'Conta do plano de contas contábil correspondente. Opcional; preenchido, permite virar lançamento contábil sem reclassificar.';

create index fin_categorias_company_id_idx on public.fin_categorias(company_id);
create unique index fin_categorias_company_codigo_sistema_idx
  on public.fin_categorias(company_id, codigo_sistema)
  where codigo_sistema is not null;

-- ---------------------------------------------------------------------------
-- fin_centros_custo — lista plana por empresa (igual ao Nibo)
-- ---------------------------------------------------------------------------

create table public.fin_centros_custo (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, nome)
);
comment on table public.fin_centros_custo is
  'Centros de custo da empresa, lista plana (sem hierarquia). Usado no rateio do agendamento, por percentual ou valor.';

create index fin_centros_custo_company_id_idx on public.fin_centros_custo(company_id);

-- ---------------------------------------------------------------------------
-- Triggers de updated_at
-- ---------------------------------------------------------------------------

create trigger fin_contatos_set_updated_at before update on public.fin_contatos
  for each row execute function public.set_updated_at();
create trigger fin_categorias_set_updated_at before update on public.fin_categorias
  for each row execute function public.set_updated_at();
create trigger fin_centros_custo_set_updated_at before update on public.fin_centros_custo
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — recortada por empresa, diferente de Legalização/Extratos
-- ---------------------------------------------------------------------------

alter table public.fin_contatos enable row level security;
alter table public.fin_categorias enable row level security;
alter table public.fin_centros_custo enable row level security;

create policy fin_contatos_all on public.fin_contatos
  for all using (public.pode_financeiro(company_id))
  with check (public.pode_financeiro(company_id));

create policy fin_categorias_all on public.fin_categorias
  for all using (public.pode_financeiro(company_id))
  with check (public.pode_financeiro(company_id));

create policy fin_centros_custo_all on public.fin_centros_custo
  for all using (public.pode_financeiro(company_id))
  with check (public.pode_financeiro(company_id));

-- ---------------------------------------------------------------------------
-- Plano de categorias padrão
--
-- Semeado por empresa na primeira vez que o módulo é aberto, não em massa nas
-- ~215 empresas — só um punhado usa financeiro hoje. Idempotente: se a empresa
-- já tem categoria, não faz nada (não repõe o que o usuário apagou de
-- propósito).
-- ---------------------------------------------------------------------------

create or replace function public.fin_seed_categorias_padrao(p_company_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (select 1 from public.fin_categorias where company_id = p_company_id) then
    return;
  end if;

  insert into public.fin_categorias
    (company_id, grupo, nome, natureza, sistema, codigo_sistema, ordem)
  values
    -- Receitas operacionais
    (p_company_id, 'RECEITA_OPERACIONAL', 'Receita com serviços',        'ENTRADA', false, null,                 10),
    (p_company_id, 'RECEITA_OPERACIONAL', 'Receita com vendas',          'ENTRADA', false, null,                 20),
    (p_company_id, 'RECEITA_OPERACIONAL', 'Outras receitas',             'ENTRADA', false, null,                 30),
    (p_company_id, 'RECEITA_OPERACIONAL', 'Juros recebidos',             'ENTRADA', true,  'JUROS_RECEBIDOS',    40),
    (p_company_id, 'RECEITA_OPERACIONAL', 'Multas recebidas',            'ENTRADA', true,  'MULTAS_RECEBIDAS',   50),
    (p_company_id, 'RECEITA_OPERACIONAL', 'Descontos concedidos',        'SAIDA',   true,  'DESCONTOS_CONCEDIDOS', 60),

    -- Custos e despesas operacionais
    (p_company_id, 'CUSTO_DESPESA_OPERACIONAL', 'Salários, encargos e benefícios', 'SAIDA', false, null, 110),
    (p_company_id, 'CUSTO_DESPESA_OPERACIONAL', 'Pró-labore',                      'SAIDA', false, null, 120),
    (p_company_id, 'CUSTO_DESPESA_OPERACIONAL', 'Serviços contratados',            'SAIDA', false, null, 130),
    (p_company_id, 'CUSTO_DESPESA_OPERACIONAL', 'Aluguel e condomínio',            'SAIDA', false, null, 140),
    (p_company_id, 'CUSTO_DESPESA_OPERACIONAL', 'Luz, água e outros',              'SAIDA', false, null, 150),
    (p_company_id, 'CUSTO_DESPESA_OPERACIONAL', 'Telefonia e internet',            'SAIDA', false, null, 160),
    (p_company_id, 'CUSTO_DESPESA_OPERACIONAL', 'Material de escritório',          'SAIDA', false, null, 170),
    (p_company_id, 'CUSTO_DESPESA_OPERACIONAL', 'Marketing e propaganda',          'SAIDA', false, null, 180),
    (p_company_id, 'CUSTO_DESPESA_OPERACIONAL', 'Impostos e contribuições',        'SAIDA', false, null, 190),
    (p_company_id, 'CUSTO_DESPESA_OPERACIONAL', 'Tarifa bancária',                 'SAIDA', false, null, 200),
    (p_company_id, 'CUSTO_DESPESA_OPERACIONAL', 'Outras despesas',                 'SAIDA', false, null, 210),
    (p_company_id, 'CUSTO_DESPESA_OPERACIONAL', 'Juros pagos',                     'SAIDA', true,  'JUROS_PAGOS',       220),
    (p_company_id, 'CUSTO_DESPESA_OPERACIONAL', 'Multas pagas',                    'SAIDA', true,  'MULTAS_PAGAS',      230),
    (p_company_id, 'CUSTO_DESPESA_OPERACIONAL', 'Descontos obtidos',               'ENTRADA', true, 'DESCONTOS_OBTIDOS', 240),

    -- Retenções sofridas/retidas sobre pagamentos (sistema — alimentadas pelo
    -- cálculo de retenção do agendamento, não digitadas pelo usuário)
    (p_company_id, 'CUSTO_DESPESA_OPERACIONAL', 'ISS retido sobre pagamentos',     'ENTRADA', true, 'ISS_RETIDO',    310),
    (p_company_id, 'CUSTO_DESPESA_OPERACIONAL', 'IRRF retido sobre pagamentos',    'ENTRADA', true, 'IRRF_RETIDO',   320),
    (p_company_id, 'CUSTO_DESPESA_OPERACIONAL', 'CSLL retida sobre pagamentos',    'ENTRADA', true, 'CSLL_RETIDA',   330),
    (p_company_id, 'CUSTO_DESPESA_OPERACIONAL', 'INSS retido sobre pagamentos',    'ENTRADA', true, 'INSS_RETIDO',   340),
    (p_company_id, 'CUSTO_DESPESA_OPERACIONAL', 'PIS retido sobre pagamentos',     'ENTRADA', true, 'PIS_RETIDO',    350),
    (p_company_id, 'CUSTO_DESPESA_OPERACIONAL', 'COFINS retida sobre pagamentos',  'ENTRADA', true, 'COFINS_RETIDA', 360),
    (p_company_id, 'CUSTO_DESPESA_OPERACIONAL', 'Outras retenções sobre pagamentos', 'ENTRADA', true, 'OUTRAS_RETENCOES', 370),

    -- Investimento
    (p_company_id, 'INVESTIMENTO', 'Compra de ativo fixo',   'SAIDA',   false, null, 410),
    (p_company_id, 'INVESTIMENTO', 'Venda de ativo fixo',    'ENTRADA', false, null, 420),
    (p_company_id, 'INVESTIMENTO', 'Aplicação financeira',   'SAIDA',   false, null, 430),
    (p_company_id, 'INVESTIMENTO', 'Resgate de aplicação',   'ENTRADA', false, null, 440),

    -- Financiamento
    (p_company_id, 'FINANCIAMENTO', 'Aporte de capital',        'ENTRADA', false, null, 510),
    (p_company_id, 'FINANCIAMENTO', 'Retirada de capital',      'SAIDA',   false, null, 520),
    (p_company_id, 'FINANCIAMENTO', 'Obtenção de empréstimo',   'ENTRADA', false, null, 530),
    (p_company_id, 'FINANCIAMENTO', 'Pagamento de empréstimo',  'SAIDA',   false, null, 540),
    (p_company_id, 'FINANCIAMENTO', 'Distribuição de lucros',   'SAIDA',   false, null, 550);
end;
$$;

comment on function public.fin_seed_categorias_padrao(uuid) is
  'Semeia o plano de categorias padrão de uma empresa. Idempotente: não faz nada se a empresa já tiver qualquer categoria. security invoker de propósito — quem não passa na RLS de fin_categorias não semeia.';
