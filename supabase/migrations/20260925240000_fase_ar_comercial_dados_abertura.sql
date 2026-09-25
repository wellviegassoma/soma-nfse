-- Fase AR — Comercial: campos pra coletar os dados do contrato social quando
-- tipo_onboarding = 'ABERTURA_NOVO_CNPJ' (a empresa ainda não existe, então
-- não tem onde mais guardar isso além do próprio prospect).
alter table public.comercial_prospects
  add column abertura_cartorio_jucerja text,
  add column abertura_capital_social numeric(14, 2),
  add column abertura_divisao_capital text,
  add column abertura_administrador text,
  add column abertura_cota_tipo text check (abertura_cota_tipo is null or abertura_cota_tipo in ('PROPORCIONAL', 'DESPROPORCIONAL')),
  add column abertura_cnaes text,
  add column abertura_opcoes_nome text;
