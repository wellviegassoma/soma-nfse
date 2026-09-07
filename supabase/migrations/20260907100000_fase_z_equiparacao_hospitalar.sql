-- Fase Z — Equiparação hospitalar (Lei 9.249/95 arts. 15 e 20): parte
-- do faturamento de uma empresa em Lucro Presumido pode ter presunção
-- de 8% (IRPJ) / 12% (CSLL) em vez dos 32%/32% gerais, quando o serviço
-- prestado se equipara a atividade hospitalar (estrutura registrada na
-- ANVISA/RDC 50) — precisa ser marcado por NOTA, não por serviço
-- cadastrado, porque a mesma prestação pode variar de caso a caso.
--
-- Só em notas_distribuidas, não em dps: toda nota emitida por aqui
-- (dps) acaba espelhada em notas_distribuidas assim que o Sefin
-- Nacional distribui (mesmo chave_acesso — ver dedup em
-- lib/faturamento.ts), e é a única tabela que a tela de Fechamento lê
-- pra listar/editar nota por nota.
alter table public.notas_distribuidas
  add column equiparacao_hospitalar boolean not null default false;
