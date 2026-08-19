-- Fase E — PIS/COFINS de apuração própria (aliquota_pis/aliquota_cofins) e
-- retenções federais na fonte (IRRF 1,5% e PIS/COFINS/CSLL 4,65%, IN RFB
-- 1.234/2012). Domínio de tpRetPisCofins confirmado na Nota Técnica
-- SE/CGNFS-e nº 007/2026 (gov.br/nfse): 0 = nada retido (já validado em nota
-- real aceita), 3 = PIS/COFINS/CSLL retidos (o código a usar quando
-- retencao_pis_cofins_csll_aliquota estiver preenchido).

alter table public.services
  add column aliquota_pis numeric(5, 2),
  add column aliquota_cofins numeric(5, 2),
  add column retencao_pis_cofins_csll_aliquota numeric(5, 2),
  add column retencao_irrf_aliquota numeric(5, 2);

comment on column public.services.aliquota_pis is
  'pAliqPis (%) — débito de apuração própria do PIS. Ex.: 0.65 no regime cumulativo (Lucro Presumido, CST 01).';
comment on column public.services.aliquota_cofins is
  'pAliqCofins (%) — débito de apuração própria da COFINS. Ex.: 3.00 no regime cumulativo (Lucro Presumido, CST 01).';
comment on column public.services.retencao_pis_cofins_csll_aliquota is
  'Alíquota combinada de PIS+COFINS+CSLL retidos na fonte pelo tomador (IN RFB 1.234/2012, ex.: 4.65). Nulo = não retido (tpRetPisCofins=0). Preenchido = tpRetPisCofins=3.';
comment on column public.services.retencao_irrf_aliquota is
  'Alíquota de IRRF retido na fonte pelo tomador (ex.: 1.5 para serviços profissionais, IN RFB 1.234/2012 Anexo I). Nulo = não retido.';
