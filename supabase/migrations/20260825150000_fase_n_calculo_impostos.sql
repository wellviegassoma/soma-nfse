-- Fase N — Cálculo de impostos (Simples Nacional e Lucro Presumido) com base
-- no faturamento já registrado no sistema. Campos de configuração que a
-- planilha manual de apuração da SOMA já usa (Fator R, apuração mensal do
-- IRPJ/CSLL, alíquota de ISS) — sem controle de folha de pagamento no
-- sistema, o Fator R é informado manualmente por competência não disponível
-- ainda, então por empresa mesmo (ver README, Fase N).

alter table public.companies
  add column sujeito_fator_r boolean not null default false,
  add column fator_r_percentual numeric(6, 4),
  add column irpj_csll_apuracao_mensal boolean not null default false,
  add column iss_aliquota_padrao numeric(6, 4);

comment on column public.companies.sujeito_fator_r is
  'Simples Nacional, prestador de serviço: define se o Anexo III/V é escolhido pelo Fator R (folha ÷ RBT12) — sem controle de folha no sistema, informado manualmente.';
comment on column public.companies.fator_r_percentual is
  'Fator R manual (ex.: 0.28 = 28%). Fator R >= 28% usa Anexo III; abaixo disso, Anexo V.';
comment on column public.companies.irpj_csll_apuracao_mensal is
  'Lucro Presumido: antecipa IRPJ/CSLL mensalmente em vez de só apurar trimestralmente (mesmo campo "Pagamento Mensal do IRPJ/CSLL" da planilha manual).';
comment on column public.companies.iss_aliquota_padrao is
  'Lucro Presumido: alíquota de ISS do município (ex.: 0.02 = 2%), usada no cálculo agregado mensal.';
