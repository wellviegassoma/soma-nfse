-- Fator R oficial (LC 123/2006) usa "folha de salários, incluídos
-- encargos" pelo regime de competência do pró-labore mas de CAIXA pros
-- demais itens: pró-labore entra no mês da própria folha, enquanto
-- salários e FGTS só são efetivamente pagos/recolhidos no mês seguinte
-- (salário sai por volta do dia 5, FGTS até o dia 20 do mês seguinte via
-- FGTS Digital) — então precisam ser lançados um mês à frente na conta.
-- `valor` continua sendo usado como "salários" (folha analítica) ou
-- "total já correto" (PGDAS-D, que já entrega o número oficial sem
-- precisar separar por competência aqui).

alter table public.folha_mensal
  add column pro_labore numeric(14, 2);

comment on column public.folha_mensal.pro_labore is
  'Pró-labore do mês (folha analítica) — soma no Fator R (FP12), lançado na competência da própria folha (diferente de salários/FGTS, que vão pro mês seguinte).';
