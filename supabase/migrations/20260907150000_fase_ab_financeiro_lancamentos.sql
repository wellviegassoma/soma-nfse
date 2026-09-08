-- Fase AB — Módulo Financeiro, F2: agendamentos e lançamentos.
-- Ver docs/financeiro.md. É o miolo que substitui o dia a dia do Nibo.
--
-- DESVIO DELIBERADO DA SPEC: ela previa fin_agendamento_retencoes e
-- fin_agendamento_ajustes como tabelas filhas. Viraram COLUNAS do próprio
-- agendamento, porque são valores únicos por agendamento (é exatamente assim
-- que a aba "Valores detalhados" do Nibo trata: sete campos de retenção, um
-- de desconto, um de juros, um de multa — nunca uma lista). Como colunas da
-- mesma tabela, `valor_liquido` pode ser GENERATED ALWAYS, o que elimina a
-- chance de o líquido divergir das parcelas que o compõem. Rateio de
-- categoria e de centro de custo continuam em tabelas filhas — esses sim são
-- listas de verdade.

-- ---------------------------------------------------------------------------
-- fin_agendamentos
--
-- "Agendamento" é a obrigação (a conta a pagar/receber); "lançamento" é a
-- baixa. Um agendamento aceita baixa parcial e várias baixas — foi o achado
-- central do levantamento do Nibo (coluna "Valor em aberto" + "Valor a pagar"
-- editável na tela Pagar).
-- ---------------------------------------------------------------------------

create table public.fin_agendamentos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tipo text not null check (tipo in ('RECEBER', 'PAGAR')),
  contato_id uuid references public.fin_contatos(id) on delete restrict,

  vencimento date not null,
  -- Data em que se espera de fato pagar/receber, quando difere do vencimento.
  -- É o que o fluxo de caixa projetado usa; o vencimento é a obrigação formal.
  previsto_para date,

  descricao text,
  referencia text,
  detalhamento text,

  valor_bruto numeric(14, 2) not null check (valor_bruto > 0),

  -- Retenções na fonte. Preenchidas pelo cálculo da aplicação (IN RFB
  -- 1.234/2012 e afins) ou digitadas — o Nibo só aceita digitado.
  ret_iss numeric(14, 2) not null default 0 check (ret_iss >= 0),
  ret_irrf numeric(14, 2) not null default 0 check (ret_irrf >= 0),
  ret_csll numeric(14, 2) not null default 0 check (ret_csll >= 0),
  ret_inss numeric(14, 2) not null default 0 check (ret_inss >= 0),
  ret_pis numeric(14, 2) not null default 0 check (ret_pis >= 0),
  ret_cofins numeric(14, 2) not null default 0 check (ret_cofins >= 0),
  ret_outras numeric(14, 2) not null default 0 check (ret_outras >= 0),

  desconto numeric(14, 2) not null default 0 check (desconto >= 0),
  juros numeric(14, 2) not null default 0 check (juros >= 0),
  multa numeric(14, 2) not null default 0 check (multa >= 0),

  valor_liquido numeric(14, 2) generated always as (
    valor_bruto
    - ret_iss - ret_irrf - ret_csll - ret_inss - ret_pis - ret_cofins - ret_outras
    - desconto + juros + multa
  ) stored,

  -- Mantidos por trigger a partir de fin_lancamentos — nunca escrever à mão.
  valor_liquidado numeric(14, 2) not null default 0,
  status text not null default 'ABERTO'
    check (status in ('ABERTO', 'PARCIAL', 'LIQUIDADO', 'CANCELADO')),

  recorrencia_id uuid,
  parcela_num integer,
  parcela_de integer,
  reembolsavel boolean not null default false,

  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check ((parcela_num is null) = (parcela_de is null)),
  check (parcela_num is null or (parcela_num >= 1 and parcela_num <= parcela_de))
);
comment on table public.fin_agendamentos is
  'Conta a pagar/receber. Aceita baixa parcial e várias baixas (ver fin_lancamentos). valor_liquido é gerado; valor_liquidado e status são mantidos por trigger.';
comment on column public.fin_agendamentos.previsto_para is
  'Data esperada de pagamento/recebimento quando difere do vencimento. É o que o fluxo de caixa projetado usa.';

create index fin_agendamentos_company_idx on public.fin_agendamentos(company_id);
create index fin_agendamentos_company_tipo_status_idx
  on public.fin_agendamentos(company_id, tipo, status);
create index fin_agendamentos_vencimento_idx on public.fin_agendamentos(company_id, vencimento);
create index fin_agendamentos_contato_idx on public.fin_agendamentos(contato_id);

-- ---------------------------------------------------------------------------
-- Rateio: categoria e centro de custo (listas de verdade)
-- ---------------------------------------------------------------------------

create table public.fin_agendamento_categorias (
  id uuid primary key default gen_random_uuid(),
  agendamento_id uuid not null references public.fin_agendamentos(id) on delete cascade,
  categoria_id uuid not null references public.fin_categorias(id) on delete restrict,
  valor numeric(14, 2) not null check (valor > 0),
  created_at timestamptz not null default now(),
  unique (agendamento_id, categoria_id)
);
comment on table public.fin_agendamento_categorias is
  'Rateio do agendamento por categoria. Uma linha só no caso comum; várias quando a mesma nota cobre categorias diferentes. A soma tem de fechar com valor_bruto — validado na aplicação, não aqui (constraint entre tabelas exigiria trigger, e o custo não compensa).';

create table public.fin_agendamento_centros_custo (
  id uuid primary key default gen_random_uuid(),
  agendamento_id uuid not null references public.fin_agendamentos(id) on delete cascade,
  centro_custo_id uuid not null references public.fin_centros_custo(id) on delete restrict,
  -- Percentual e valor coexistem porque o Nibo deixa escolher a forma de
  -- rateio; guardamos o percentual informado (quando foi por percentual) pra
  -- poder recalcular se o valor do agendamento mudar depois.
  percentual numeric(7, 4),
  valor numeric(14, 2) not null check (valor > 0),
  created_at timestamptz not null default now(),
  unique (agendamento_id, centro_custo_id)
);

create index fin_agendamento_categorias_agendamento_idx
  on public.fin_agendamento_categorias(agendamento_id);
create index fin_agendamento_centros_custo_agendamento_idx
  on public.fin_agendamento_centros_custo(agendamento_id);

-- ---------------------------------------------------------------------------
-- fin_transferencias — entre contas da própria empresa
-- ---------------------------------------------------------------------------

create table public.fin_transferencias (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conta_origem_id uuid not null references public.extrato_contas_bancarias(id) on delete restrict,
  conta_destino_id uuid not null references public.extrato_contas_bancarias(id) on delete restrict,
  data date not null,
  valor numeric(14, 2) not null check (valor > 0),
  descricao text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (conta_origem_id <> conta_destino_id)
);
comment on table public.fin_transferencias is
  'Movimentação entre contas próprias. Não é receita nem despesa — por isso não passa por agendamento nem por categoria; gera dois lançamentos espelhados.';

create index fin_transferencias_company_idx on public.fin_transferencias(company_id);

-- ---------------------------------------------------------------------------
-- fin_lancamentos — a baixa efetiva (o que mexe no saldo da conta)
--
-- Todo lançamento nasce de um agendamento OU de uma transferência, nunca dos
-- dois e nunca de nenhum. "Pagamento não agendado" não é exceção: a aplicação
-- cria o agendamento já liquidado, do mesmo jeito que o Nibo faz — assim a
-- categorização mora sempre no mesmo lugar.
-- ---------------------------------------------------------------------------

create table public.fin_lancamentos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agendamento_id uuid references public.fin_agendamentos(id) on delete cascade,
  transferencia_id uuid references public.fin_transferencias(id) on delete cascade,
  conta_id uuid not null references public.extrato_contas_bancarias(id) on delete restrict,
  data date not null,
  -- Positivo = entrou na conta, negativo = saiu. Guardar com sinal deixa o
  -- saldo ser um sum() puro, sem case por tipo.
  valor numeric(14, 2) not null check (valor <> 0),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (num_nonnulls(agendamento_id, transferencia_id) = 1)
);
comment on table public.fin_lancamentos is
  'Baixa efetiva de um agendamento, ou perna de uma transferência. valor com sinal: positivo entra na conta, negativo sai — saldo é sum(valor) + saldo_inicial da conta.';

create index fin_lancamentos_company_idx on public.fin_lancamentos(company_id);
create index fin_lancamentos_conta_data_idx on public.fin_lancamentos(conta_id, data);
create index fin_lancamentos_agendamento_idx on public.fin_lancamentos(agendamento_id);
create index fin_lancamentos_transferencia_idx on public.fin_lancamentos(transferencia_id);

-- ---------------------------------------------------------------------------
-- fin_recorrencias — modelo que gera agendamentos
-- ---------------------------------------------------------------------------

create table public.fin_recorrencias (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tipo text not null check (tipo in ('RECEBER', 'PAGAR')),
  modo text not null check (modo in ('PARCELAMENTO', 'RECORRENCIA')),
  frequencia text not null default 'MENSAL'
    check (frequencia in ('SEMANAL', 'QUINZENAL', 'MENSAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL')),
  parcelas integer check (parcelas is null or parcelas >= 2),
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- PARCELAMENTO tem fim conhecido (n parcelas, geradas de uma vez);
  -- RECORRENCIA é contínua e é gerada por horizonte.
  check ((modo = 'PARCELAMENTO') = (parcelas is not null))
);
comment on table public.fin_recorrencias is
  'Modelo de repetição. PARCELAMENTO gera todas as parcelas na criação (fim conhecido). RECORRENCIA é contínua: a aplicação gera um horizonte à frente e completa depois.';

alter table public.fin_agendamentos
  add constraint fin_agendamentos_recorrencia_fkey
  foreign key (recorrencia_id) references public.fin_recorrencias(id) on delete set null;

create index fin_agendamentos_recorrencia_idx on public.fin_agendamentos(recorrencia_id);

-- ---------------------------------------------------------------------------
-- fin_anexos — comprovante, boleto, nota do fornecedor
-- ---------------------------------------------------------------------------

create table public.fin_anexos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agendamento_id uuid not null references public.fin_agendamentos(id) on delete cascade,
  blob_url text not null,
  blob_pathname text not null,
  nome_arquivo text not null,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
comment on table public.fin_anexos is
  'Arquivo anexado ao agendamento, no Vercel Blob — mesmo padrão de Legalização e Extratos (nunca bytea no Postgres).';

create index fin_anexos_agendamento_idx on public.fin_anexos(agendamento_id);

-- ---------------------------------------------------------------------------
-- Trigger: mantém valor_liquidado e status do agendamento
--
-- Fonte única da verdade é a soma dos lançamentos — assim "em aberto" nunca
-- diverge do que foi realmente baixado, nem quando alguém apaga uma baixa.
-- ---------------------------------------------------------------------------

create or replace function public.fin_recalcular_agendamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agendamento_id uuid;
  v_liquidado numeric(14, 2);
  v_liquido numeric(14, 2);
  v_status text;
begin
  v_agendamento_id := coalesce(new.agendamento_id, old.agendamento_id);
  if v_agendamento_id is null then
    return coalesce(new, old); -- perna de transferência: não há agendamento
  end if;

  select coalesce(sum(abs(valor)), 0) into v_liquidado
  from public.fin_lancamentos
  where agendamento_id = v_agendamento_id;

  select valor_liquido, status into v_liquido, v_status
  from public.fin_agendamentos
  where id = v_agendamento_id;

  -- Agendamento cancelado não volta sozinho pra aberto por causa de baixa.
  if v_status = 'CANCELADO' then
    update public.fin_agendamentos
      set valor_liquidado = v_liquidado
      where id = v_agendamento_id;
    return coalesce(new, old);
  end if;

  update public.fin_agendamentos
    set valor_liquidado = v_liquidado,
        status = case
          when v_liquidado <= 0 then 'ABERTO'
          -- >= e não =: juros/multa lançados a mais no ato do pagamento não
          -- podem deixar a conta eternamente "parcial".
          when v_liquidado >= v_liquido then 'LIQUIDADO'
          else 'PARCIAL'
        end
    where id = v_agendamento_id;

  return coalesce(new, old);
end;
$$;

create trigger fin_lancamentos_recalcula_agendamento
  after insert or update or delete on public.fin_lancamentos
  for each row execute function public.fin_recalcular_agendamento();

-- Mudança no valor do agendamento (bruto, retenção, desconto, juros, multa)
-- muda o líquido e portanto pode mudar o status.
create or replace function public.fin_recalcular_status_por_valor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'CANCELADO' then
    return new;
  end if;
  new.status := case
    when new.valor_liquidado <= 0 then 'ABERTO'
    when new.valor_liquidado >= new.valor_liquido then 'LIQUIDADO'
    else 'PARCIAL'
  end;
  return new;
end;
$$;

create trigger fin_agendamentos_recalcula_status
  before update of valor_bruto, ret_iss, ret_irrf, ret_csll, ret_inss,
                   ret_pis, ret_cofins, ret_outras, desconto, juros, multa
  on public.fin_agendamentos
  for each row execute function public.fin_recalcular_status_por_valor();

create trigger fin_agendamentos_set_updated_at before update on public.fin_agendamentos
  for each row execute function public.set_updated_at();
create trigger fin_recorrencias_set_updated_at before update on public.fin_recorrencias
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — mesmo recorte por empresa da fase AA
-- ---------------------------------------------------------------------------

alter table public.fin_agendamentos enable row level security;
alter table public.fin_agendamento_categorias enable row level security;
alter table public.fin_agendamento_centros_custo enable row level security;
alter table public.fin_lancamentos enable row level security;
alter table public.fin_transferencias enable row level security;
alter table public.fin_recorrencias enable row level security;
alter table public.fin_anexos enable row level security;

create policy fin_agendamentos_all on public.fin_agendamentos
  for all using (public.pode_financeiro(company_id))
  with check (public.pode_financeiro(company_id));

create policy fin_lancamentos_all on public.fin_lancamentos
  for all using (public.pode_financeiro(company_id))
  with check (public.pode_financeiro(company_id));

create policy fin_transferencias_all on public.fin_transferencias
  for all using (public.pode_financeiro(company_id))
  with check (public.pode_financeiro(company_id));

create policy fin_recorrencias_all on public.fin_recorrencias
  for all using (public.pode_financeiro(company_id))
  with check (public.pode_financeiro(company_id));

create policy fin_anexos_all on public.fin_anexos
  for all using (public.pode_financeiro(company_id))
  with check (public.pode_financeiro(company_id));

-- As duas tabelas de rateio não têm company_id (dependem do agendamento);
-- a policy alcança a empresa pelo pai. Sem isso, o rateio ficaria acessível
-- entre empresas mesmo com o agendamento protegido.
create policy fin_agendamento_categorias_all on public.fin_agendamento_categorias
  for all using (
    exists (
      select 1 from public.fin_agendamentos a
      where a.id = agendamento_id and public.pode_financeiro(a.company_id)
    )
  )
  with check (
    exists (
      select 1 from public.fin_agendamentos a
      where a.id = agendamento_id and public.pode_financeiro(a.company_id)
    )
  );

create policy fin_agendamento_centros_custo_all on public.fin_agendamento_centros_custo
  for all using (
    exists (
      select 1 from public.fin_agendamentos a
      where a.id = agendamento_id and public.pode_financeiro(a.company_id)
    )
  )
  with check (
    exists (
      select 1 from public.fin_agendamentos a
      where a.id = agendamento_id and public.pode_financeiro(a.company_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Saldo por conta: saldo_inicial + soma dos lançamentos a partir da data
-- do saldo inicial. Função em vez de view pra poder receber a data de corte
-- (saldo "em" tal dia, usado no fluxo de caixa).
-- ---------------------------------------------------------------------------

create or replace function public.fin_saldo_conta(p_conta_id uuid, p_ate date default null)
returns numeric
language sql
security invoker
set search_path = public
stable
as $$
  select coalesce(c.saldo_inicial, 0) + coalesce((
    select sum(l.valor)
    from public.fin_lancamentos l
    where l.conta_id = c.id
      and (c.data_saldo_inicial is null or l.data >= c.data_saldo_inicial)
      and (p_ate is null or l.data <= p_ate)
  ), 0)
  from public.extrato_contas_bancarias c
  where c.id = p_conta_id;
$$;

comment on function public.fin_saldo_conta(uuid, date) is
  'Saldo da conta: saldo_inicial + lançamentos a partir de data_saldo_inicial (e até p_ate, se informado). security invoker — respeita a RLS de quem chama.';
