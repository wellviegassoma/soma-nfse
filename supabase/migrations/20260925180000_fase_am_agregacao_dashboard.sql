-- Otimização do painel /admin (Visão geral): em vez de trazer as ~28 mil
-- linhas de notas_distribuidas (direcao='saida') pro Next.js e somar em
-- JS, agrega direto no Postgres por (company_id, competencia) — o
-- resultado cai pra menos de 1.000 linhas (uma por empresa/mês com
-- movimento), então tanto a rede quanto o loop de agregação em JS somem
-- do caminho quente.
--
-- security invoker (padrão) de propósito: continua rodando sob a sessão
-- de quem chama, então a RLS de notas_distribuidas_select (só equipe
-- SOMA) se aplica normalmente — a função não é um jeito de contornar
-- permissão, só de mover a soma pra dentro do banco.
--
-- p_chaves_excluir existe pra não contar de novo uma nota que já foi
-- emitida pelo próprio soma-nfse (aparece em dps E em notas_distribuidas,
-- mesma chave_acesso) — dps tem poucas linhas, então esse deduplicate
-- continua sendo feito em JS a partir da lista de chaves de dps; aqui só
-- excluímos essas chaves da soma de notas_distribuidas.
create or replace function public.dashboard_agregado_notas_distribuidas(p_chaves_excluir text[])
returns table (
  company_id uuid,
  competencia text,
  faturamento numeric,
  faturamento_hospitalar numeric,
  notas_count bigint,
  notas_canceladas_count bigint
)
language sql
stable
set search_path = public
as $$
  select
    nd.company_id,
    coalesce(to_char(nd.competencia, 'YYYY-MM'), '') as competencia,
    coalesce(sum(nd.valor_servico) filter (where not nd.cancelada), 0) as faturamento,
    coalesce(sum(nd.valor_servico) filter (where not nd.cancelada and nd.equiparacao_hospitalar), 0) as faturamento_hospitalar,
    count(*) filter (where not nd.cancelada) as notas_count,
    count(*) filter (where nd.cancelada) as notas_canceladas_count
  from public.notas_distribuidas nd
  where nd.direcao = 'saida'
    and (nd.chave_acesso is null or nd.chave_acesso <> all(coalesce(p_chaves_excluir, array[]::text[])))
  group by nd.company_id, coalesce(to_char(nd.competencia, 'YYYY-MM'), '');
$$;

comment on function public.dashboard_agregado_notas_distribuidas(text[]) is
  'Soma notas_distribuidas por empresa/mês direto no Postgres pro dashboard /admin — substitui trazer todas as linhas pro Next.js. security invoker: RLS de notas_distribuidas_select (só equipe SOMA) continua valendo.';

grant execute on function public.dashboard_agregado_notas_distribuidas(text[]) to authenticated;
