-- Fase V — retenção combinada de PIS+COFINS+CSLL (vRetCSLL do layout
-- nacional) nas notas sincronizadas. `notas_distribuidas` já guardava
-- valor_ret_cp (INSS retido) e valor_ret_irrf (IRRF retido), mas faltava
-- esse terceiro — apesar do nome da tag ser só "CSLL", o campo é a SOMA
-- de PIS+COFINS+CSLL retidos pelo tomador (código de receita 5952,
-- IN RFB 1234/2012), quando o tomador está obrigado a reter. Necessário
-- pra abater retenção sofrida do imposto apurado (Lucro Presumido/MIT e
-- Simples Nacional/PGDAS-D) em vez de cobrar em dobro o que o tomador já
-- recolheu na fonte.

alter table public.notas_distribuidas
  add column valor_ret_csll numeric(14, 2);

comment on column public.notas_distribuidas.valor_ret_csll is
  'vRetCSLL do layout nacional — soma de PIS+COFINS+CSLL retidos pelo tomador (código 5952), não só CSLL apesar do nome da tag.';
