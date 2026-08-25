-- Fase J — Fechamento importado: permite subir manualmente os XMLs de
-- notas já baixadas por fora (ex.: outra aplicação do próprio usuário),
-- alimentando o mesmo notas_distribuidas usado pela sincronização
-- automática e pelo relatório — sem depender só da API de distribuição
-- do Sefin Nacional (que tem se mostrado instável em produção real).

alter table public.notas_distribuidas
  alter column nsu drop not null;

comment on column public.notas_distribuidas.nsu is
  'NSU da distribuição — nulo quando a nota veio de importação manual de XML (não tem NSU nesse caso).';

alter table public.notas_distribuidas
  add column origem text not null default 'distribuicao'
    check (origem in ('distribuicao', 'importado_manual'));

comment on column public.notas_distribuidas.origem is
  'De onde essa nota veio: distribuicao (sincronização automática/NSU) ou importado_manual (upload de XML).';
