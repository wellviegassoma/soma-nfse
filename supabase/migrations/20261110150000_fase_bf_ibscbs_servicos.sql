-- Reforma Tributária (IBS/CBS) na NFS-e Nacional — grupo <IBSCBS> da DPS
-- (leiaute 1.01). Obrigatório para o regime normal (Lucro Presumido/Real)
-- desde out/2026; Simples Nacional só a partir de 2027. A nota só leva a
-- classificação — o Sefin Nacional calcula base, alíquotas e valores.
-- Sugestões vêm do Anexo VIII (correlação Item LC 116 × NBS × cIndOp ×
-- cClassTrib) — ver frontend/src/lib/ibscbs-correlacao.ts.

alter table public.services
  add column if not exists ibscbs_cst text,
  add column if not exists ibscbs_cclasstrib text,
  add column if not exists ibscbs_cind_op text;

comment on column public.services.ibscbs_cst is
  'CST do IBS/CBS (3 dígitos, = 3 primeiros do cClassTrib). Ex.: 200 = tributação com redução de alíquota.';
comment on column public.services.ibscbs_cclasstrib is
  'cClassTrib (6 dígitos). Ex.: 200029 = serviços de saúde humana (redução de 60%, Anexo III LC 214).';
comment on column public.services.ibscbs_cind_op is
  'cIndOp — indicador da operação / local de incidência do IBS (6 dígitos). Ex.: 030101 = prestado no estabelecimento do prestador.';

alter table public.services
  add constraint services_ibscbs_cst_formato check (ibscbs_cst is null or ibscbs_cst ~ '^\d{3}$'),
  add constraint services_ibscbs_cclasstrib_formato check (ibscbs_cclasstrib is null or ibscbs_cclasstrib ~ '^\d{6}$'),
  add constraint services_ibscbs_cind_op_formato check (ibscbs_cind_op is null or ibscbs_cind_op ~ '^\d{6}$');
