-- Fase AC — Módulo Financeiro, F3: extrato importado e conciliação.
-- Ver docs/financeiro.md. Fecha o ciclo de caixa: até aqui o sistema sabia o
-- que DEVIA acontecer (agendamentos) e o que foi baixado à mão; agora entra o
-- que o banco diz que aconteceu, e o casamento entre os dois.

-- ---------------------------------------------------------------------------
-- fin_importacoes — uma linha por arquivo importado
--
-- Equivale ao "Histórico de importação" do Nibo. Serve pra auditoria (quem
-- subiu o quê) e pra desfazer uma importação inteira quando o arquivo errado
-- foi escolhido — sem isso, achar as linhas de um import específico depois
-- vira caça manual.
-- ---------------------------------------------------------------------------

create table public.fin_importacoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conta_id uuid not null references public.extrato_contas_bancarias(id) on delete cascade,
  origem text not null check (origem in ('OFX', 'CSV', 'PDF', 'MANUAL')),
  nome_arquivo text,
  periodo_inicio date,
  periodo_fim date,
  linhas_lidas integer not null default 0,
  linhas_novas integer not null default 0,
  linhas_duplicadas integer not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
comment on table public.fin_importacoes is
  'Um arquivo de extrato importado. linhas_duplicadas conta o que o dedupe barrou — reimportar o mesmo período é rotina, não erro.';

create index fin_importacoes_company_idx on public.fin_importacoes(company_id);
create index fin_importacoes_conta_idx on public.fin_importacoes(conta_id);

-- ---------------------------------------------------------------------------
-- fin_extrato_linhas — a linha crua do banco, do jeito que veio
--
-- Nunca é editada pra "ajustar" nada: ela é a versão do banco dos fatos. O que
-- muda é o status e o vínculo com o lançamento.
-- ---------------------------------------------------------------------------

create table public.fin_extrato_linhas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conta_id uuid not null references public.extrato_contas_bancarias(id) on delete cascade,
  importacao_id uuid references public.fin_importacoes(id) on delete set null,
  data date not null,
  descricao text not null,
  documento text,
  -- Mesmo sinal de fin_lancamentos: positivo entrou, negativo saiu.
  valor numeric(14, 2) not null check (valor <> 0),
  origem text not null check (origem in ('OFX', 'CSV', 'PDF', 'MANUAL')),
  -- FITID do OFX quando existe: é o id que o próprio banco dá à transação, o
  -- dedupe mais confiável possível. Sem ele, cai no hash calculado.
  fitid text,
  hash_dedupe text not null,
  status text not null default 'PENDENTE'
    check (status in ('PENDENTE', 'CONCILIADO', 'IGNORADO')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Dedupe é por CONTA, não global: duas contas podem ter a mesma tarifa, no
  -- mesmo dia, pelo mesmo valor, e as duas linhas são reais.
  unique (conta_id, hash_dedupe)
);
comment on table public.fin_extrato_linhas is
  'Linha do extrato bancário, como o banco mandou. Nunca editada — o que muda é status e o vínculo em fin_conciliacoes.';
comment on column public.fin_extrato_linhas.hash_dedupe is
  'FITID quando o OFX traz, senão hash de conta+data+valor+descrição normalizada. Único por conta: reimportar o mesmo período não duplica.';

create index fin_extrato_linhas_company_idx on public.fin_extrato_linhas(company_id);
create index fin_extrato_linhas_conta_status_idx
  on public.fin_extrato_linhas(conta_id, status, data);

-- ---------------------------------------------------------------------------
-- fin_conciliacoes — o casamento
--
-- n:n de propósito: um pagamento único no banco pode quitar duas contas
-- (agrupamento), e uma conta pode ter sido paga em duas transferências.
-- ---------------------------------------------------------------------------

create table public.fin_conciliacoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  extrato_linha_id uuid not null references public.fin_extrato_linhas(id) on delete cascade,
  lancamento_id uuid not null references public.fin_lancamentos(id) on delete cascade,
  -- AUTOMATICA = sugestão do sistema aceita pelo usuário; MANUAL = ele escolheu
  -- na mão. Guardado pra medir a taxa de acerto da sugestão depois.
  modo text not null default 'MANUAL' check (modo in ('MANUAL', 'AUTOMATICA')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (extrato_linha_id, lancamento_id)
);
comment on table public.fin_conciliacoes is
  'Liga linha de extrato a lançamento. n:n porque um débito único pode quitar várias contas e uma conta pode ser paga em várias transações.';

create index fin_conciliacoes_linha_idx on public.fin_conciliacoes(extrato_linha_id);
create index fin_conciliacoes_lancamento_idx on public.fin_conciliacoes(lancamento_id);

-- ---------------------------------------------------------------------------
-- Trigger: status da linha acompanha a existência de conciliação
--
-- Mesmo princípio do valor_liquidado do agendamento: o status é derivado, não
-- digitado, pra nunca sobrar linha marcada como conciliada sem vínculo nenhum.
-- IGNORADO é decisão do usuário e não é tocado aqui.
-- ---------------------------------------------------------------------------

create or replace function public.fin_atualizar_status_linha()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linha_id uuid;
  v_tem boolean;
begin
  v_linha_id := coalesce(new.extrato_linha_id, old.extrato_linha_id);

  select exists (
    select 1 from public.fin_conciliacoes where extrato_linha_id = v_linha_id
  ) into v_tem;

  update public.fin_extrato_linhas
    set status = case
      when v_tem then 'CONCILIADO'
      when status = 'IGNORADO' then 'IGNORADO'
      else 'PENDENTE'
    end
    where id = v_linha_id;

  return coalesce(new, old);
end;
$$;

create trigger fin_conciliacoes_atualiza_linha
  after insert or delete on public.fin_conciliacoes
  for each row execute function public.fin_atualizar_status_linha();

create trigger fin_extrato_linhas_set_updated_at before update on public.fin_extrato_linhas
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — mesmo recorte por empresa das fases AA/AB
-- ---------------------------------------------------------------------------

alter table public.fin_importacoes enable row level security;
alter table public.fin_extrato_linhas enable row level security;
alter table public.fin_conciliacoes enable row level security;

create policy fin_importacoes_all on public.fin_importacoes
  for all using (public.pode_financeiro(company_id))
  with check (public.pode_financeiro(company_id));

create policy fin_extrato_linhas_all on public.fin_extrato_linhas
  for all using (public.pode_financeiro(company_id))
  with check (public.pode_financeiro(company_id));

create policy fin_conciliacoes_all on public.fin_conciliacoes
  for all using (public.pode_financeiro(company_id))
  with check (public.pode_financeiro(company_id));

-- ---------------------------------------------------------------------------
-- Sugestão de conciliação
--
-- Para uma linha pendente, devolve os agendamentos em aberto que podem ser
-- ela: mesmo sentido (débito no banco = conta a pagar), valor em aberto igual,
-- e vencimento perto da data do lançamento. Ordenado pela distância de data,
-- então o palpite mais provável vem primeiro.
--
-- Só SUGERE. Quem confirma é o usuário — conciliação errada suja o saldo e a
-- contabilidade ao mesmo tempo.
-- ---------------------------------------------------------------------------

create or replace function public.fin_sugerir_conciliacao(
  p_linha_id uuid,
  p_tolerancia_dias integer default 3
)
returns table (
  agendamento_id uuid,
  descricao text,
  vencimento date,
  valor_em_aberto numeric,
  distancia_dias integer
)
language sql
security invoker
set search_path = public
stable
as $$
  select
    a.id,
    a.descricao,
    a.vencimento,
    (a.valor_liquido - a.valor_liquidado) as valor_em_aberto,
    abs(a.vencimento - l.data) as distancia_dias
  from public.fin_extrato_linhas l
  join public.fin_agendamentos a
    on a.company_id = l.company_id
   and a.status in ('ABERTO', 'PARCIAL')
   and a.tipo = case when l.valor < 0 then 'PAGAR' else 'RECEBER' end
   and (a.valor_liquido - a.valor_liquidado) = abs(l.valor)
   and abs(a.vencimento - l.data) <= p_tolerancia_dias
  where l.id = p_linha_id
  order by abs(a.vencimento - l.data), a.vencimento
  limit 10;
$$;

comment on function public.fin_sugerir_conciliacao(uuid, integer) is
  'Agendamentos em aberto compatíveis com uma linha de extrato (mesmo sentido, valor em aberto exato, data próxima). Só sugere — quem confirma é o usuário.';
