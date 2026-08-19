-- Fase G — Trava de emissão retroativa: por padrão só permite emitir com
-- competência no mês corrente (evita problema de apuração de imposto do
-- mês errado). Só a SOMA (ADMIN_SOMA/SUPER_ADMIN, via requireSomaStaff())
-- pode habilitar exceção por empresa, na aba Dados fiscais.

alter table public.companies
  add column allow_retroactive_emission boolean not null default false;

comment on column public.companies.allow_retroactive_emission is
  'Se falso (padrão), issueNfse() bloqueia emissão com data_competencia fora do mês corrente. Só a SOMA habilita.';
