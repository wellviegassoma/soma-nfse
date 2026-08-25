-- Fase N (ajuste) — RBT12 manual: empresa que já faturava antes de
-- começar a usar o soma-nfse não tem histórico suficiente no sistema pra
-- calcular o RBT12 real (ficaria artificialmente baixo/zerado). Permite
-- informar manualmente, mesmo padrão do fator_r_percentual.

alter table public.companies
  add column rbt12_manual numeric(14, 2);

comment on column public.companies.rbt12_manual is
  'RBT12 (receita bruta últimos 12 meses) informado manualmente — usado no lugar do calculado a partir do faturamento no sistema quando o histórico aqui for insuficiente (ex.: cliente migrou de outro sistema/contador).';
