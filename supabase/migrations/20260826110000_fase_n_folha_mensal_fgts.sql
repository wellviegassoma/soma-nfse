-- A folha analítica (relatório interno de DP da SOMA) traz o FGTS do mês
-- separado da folha bruta ("Total Geral da Folha") — a pedido do
-- usuário, guarda os dois em colunas próprias em vez de só um valor,
-- pra poder ver/editar cada um independente na revisão da importação e
-- na tabela do Fator R. Não entra na conta do Fator R (FP12 continua
-- somando só `valor`) — é só um campo informativo a mais por competência.

alter table public.folha_mensal
  add column fgts numeric(14, 2);

comment on column public.folha_mensal.fgts is
  'FGTS do mês (informativo, não entra no cálculo do Fator R) — vem da seção "Informações adicionais" da folha analítica quando importado por lá.';
