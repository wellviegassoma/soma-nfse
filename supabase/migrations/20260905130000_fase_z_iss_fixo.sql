-- Fase Z — ISS Fixo, além do ISS percentual (iss_aliquota_padrao) já
-- existente. Sociedade uniprofissional (comum no Rio de Janeiro — LC
-- 116/2003 art. 9º §§1-3 + legislação municipal) paga um valor fixo por
-- profissional habilitado, não % sobre o faturamento — precisa de campos
-- próprios, o cálculo não é "receita × alíquota" nesse caso.
create type public.iss_tipo as enum ('PERCENTUAL', 'FIXO');

alter table public.companies
  add column iss_tipo public.iss_tipo not null default 'PERCENTUAL',
  add column iss_valor_fixo_profissional numeric(10, 2),
  add column iss_quantidade_profissionais integer;

comment on column public.companies.iss_valor_fixo_profissional is
  'Valor de ISS Fixo por profissional habilitado, em R$ (ex.: sociedade uniprofissional no Rio de Janeiro) — usado só quando iss_tipo = FIXO.';
comment on column public.companies.iss_quantidade_profissionais is
  'Quantidade de profissionais habilitados da sociedade uniprofissional — multiplicado por iss_valor_fixo_profissional pra achar o ISS Fixo mensal/trimestral.';
