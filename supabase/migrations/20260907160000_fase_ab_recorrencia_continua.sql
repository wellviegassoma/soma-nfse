-- Fase AB (parte 2) — Recorrência contínua.
--
-- A F2 entregou só PARCELAMENTO (fim conhecido, todas as parcelas geradas de
-- uma vez). Falta o caso mais comum do escritório: aluguel, honorário,
-- mensalidade — repetição sem data pra acabar.
--
-- Estratégia: a recorrência guarda o MODELO do agendamento e um horizonte
-- gerado à frente (12 meses por padrão). Gera na criação e o cron diário
-- completa. Se o cron falhar, o cliente ainda tem até um ano de contas
-- agendadas — falha visível e sem urgência, em vez de silenciosa e imediata.

alter table public.fin_recorrencias
  add column contato_id uuid references public.fin_contatos(id) on delete set null,
  add column categoria_id uuid references public.fin_categorias(id) on delete restrict,
  add column centro_custo_id uuid references public.fin_centros_custo(id) on delete set null,
  add column descricao text,
  add column referencia text,
  add column valor_bruto numeric(14, 2) not null default 0,
  add column ret_iss numeric(14, 2) not null default 0,
  add column ret_irrf numeric(14, 2) not null default 0,
  add column ret_csll numeric(14, 2) not null default 0,
  add column ret_inss numeric(14, 2) not null default 0,
  add column ret_pis numeric(14, 2) not null default 0,
  add column ret_cofins numeric(14, 2) not null default 0,
  add column ret_outras numeric(14, 2) not null default 0,
  add column desconto numeric(14, 2) not null default 0,
  add column data_inicio date,
  add column data_fim date,
  add column gerado_ate date,
  add column horizonte_meses integer not null default 12;

comment on column public.fin_recorrencias.gerado_ate is
  'Vencimento da última ocorrência já gerada. O gerador continua daqui — é o que torna a geração idempotente e permite rodar o cron quantas vezes quiser.';
comment on column public.fin_recorrencias.horizonte_meses is
  'Quantos meses à frente manter gerado. Serve de folga: se o cron parar, o cliente ainda tem contas agendadas por esse período.';
comment on column public.fin_recorrencias.data_fim is
  'Opcional. Recorrência sem data de fim gera indefinidamente, sempre respeitando o horizonte.';

-- ---------------------------------------------------------------------------
-- Gerador
--
-- security invoker de propósito: chamado pelo usuário, respeita a RLS de
-- fin_agendamentos (só gera nas empresas que ele pode ver); chamado pelo cron
-- com service role, a RLS é ignorada e ele varre todas.
-- ---------------------------------------------------------------------------

create or replace function public.fin_gerar_recorrencias(p_company_id uuid default null)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  r record;
  v_passo interval;
  v_n integer;
  v_proxima date;
  v_limite date;
  v_criados integer := 0;
  v_novo_id uuid;
begin
  for r in
    select * from public.fin_recorrencias
    where modo = 'RECORRENCIA'
      and ativa
      and categoria_id is not null
      and data_inicio is not null
      and valor_bruto > 0
      and (p_company_id is null or company_id = p_company_id)
  loop
    v_passo := case r.frequencia
      when 'SEMANAL' then interval '7 days'
      when 'QUINZENAL' then interval '15 days'
      when 'BIMESTRAL' then interval '2 months'
      when 'TRIMESTRAL' then interval '3 months'
      when 'SEMESTRAL' then interval '6 months'
      when 'ANUAL' then interval '1 year'
      else interval '1 month'
    end;

    -- Cada ocorrência é sempre data_inicio + n passos, NUNCA a anterior + um
    -- passo. A diferença importa em vencimento no fim do mês: somando de uma
    -- em uma, 31/01 vira 28/02 e daí em diante fica preso no 28; ancorando na
    -- data inicial, volta pro 31 nos meses que têm dia 31.
    select count(*) into v_n
    from public.fin_agendamentos where recorrencia_id = r.id;

    v_proxima := (r.data_inicio + (v_n * v_passo))::date;
    v_limite := (current_date + make_interval(months => r.horizonte_meses))::date;
    if r.data_fim is not null and r.data_fim < v_limite then
      v_limite := r.data_fim;
    end if;

    while v_proxima <= v_limite loop
      insert into public.fin_agendamentos (
        company_id, tipo, contato_id, vencimento, descricao, referencia,
        valor_bruto, ret_iss, ret_irrf, ret_csll, ret_inss, ret_pis,
        ret_cofins, ret_outras, desconto, recorrencia_id
      ) values (
        r.company_id, r.tipo, r.contato_id, v_proxima, r.descricao, r.referencia,
        r.valor_bruto, r.ret_iss, r.ret_irrf, r.ret_csll, r.ret_inss, r.ret_pis,
        r.ret_cofins, r.ret_outras, r.desconto, r.id
      )
      returning id into v_novo_id;

      -- Sem categoria o agendamento não entra em relatório nenhum, então o
      -- rateio é parte da mesma operação, não um passo opcional.
      insert into public.fin_agendamento_categorias (agendamento_id, categoria_id, valor)
      values (v_novo_id, r.categoria_id, r.valor_bruto);

      if r.centro_custo_id is not null then
        insert into public.fin_agendamento_centros_custo
          (agendamento_id, centro_custo_id, percentual, valor)
        values (v_novo_id, r.centro_custo_id, 100, r.valor_bruto);
      end if;

      update public.fin_recorrencias set gerado_ate = v_proxima where id = r.id;
      v_n := v_n + 1;
      v_proxima := (r.data_inicio + (v_n * v_passo))::date;
      v_criados := v_criados + 1;

      -- Trava de segurança: uma frequência semanal com horizonte longo não
      -- pode virar um laço de milhares de linhas numa requisição só.
      exit when v_criados >= 500;
    end loop;

    exit when v_criados >= 500;
  end loop;

  return v_criados;
end;
$$;

comment on function public.fin_gerar_recorrencias(uuid) is
  'Gera as ocorrências faltantes das recorrências ativas até o horizonte. Idempotente (continua de gerado_ate), então pode rodar quantas vezes for. Devolve quantos agendamentos criou.';
