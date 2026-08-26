-- Regra oficial do Simples Nacional: empresa com menos de 12 meses de
-- existência tem o RBT12 calculado por PROJEÇÃO PROPORCIONAL do
-- faturamento real desde a abertura (não é uma estimativa por falta de
-- dado — é a fórmula correta por lei nesse caso). Sem saber a data de
-- abertura, o sistema não tinha como distinguir essa empresa realmente
-- nova de uma empresa antiga que só entrou recentemente no sistema (e
-- que, portanto, deveria usar o RBT12 manual informado, nunca uma
-- projeção proporcional inventada a partir de histórico incompleto).

alter table public.companies
  add column data_abertura date;

comment on column public.companies.data_abertura is
  'Data de abertura do CNPJ — usada pra decidir se o RBT12 deve ser projetado proporcionalmente (empresa com menos de 12 meses de existência, regra oficial) em vez de depender do RBT12 manual/histórico do sistema.';
