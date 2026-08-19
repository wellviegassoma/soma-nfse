-- Fase E — Regime especial de tributação (regEspTrib) é atributo do
-- PRESTADOR (empresa), não do serviço — corrige campo que existia em
-- `services.taxation_type` mas nunca era enviado ao Sefin Nacional
-- (emissor.py sempre usava o default 0 vindo de PrestadorIn).
--
-- Domínio confirmado via múltiplas fontes (ACBr, TOTVS) para o layout
-- NFS-e Nacional: 0-Nenhum, 1-Ato Cooperado, 2-Estimativa,
-- 3-Microempresa Municipal, 4-Notário ou Registrador, 5-Profissional
-- Autônomo, 6-Sociedade de Profissionais.

alter table public.companies
  add column regime_especial_tributacao smallint not null default 0
    check (regime_especial_tributacao between 0 and 6);

comment on column public.companies.regime_especial_tributacao is
  'regEspTrib — 0=Nenhum, 1=Ato Cooperado, 2=Estimativa, 3=Microempresa Municipal, 4=Notário ou Registrador, 5=Profissional Autônomo, 6=Sociedade de Profissionais.';
