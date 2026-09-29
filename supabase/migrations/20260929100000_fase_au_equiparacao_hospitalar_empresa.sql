-- Fase AU — Equiparação hospitalar por empresa: sinaliza quais empresas em
-- Lucro Presumido precisam ter as notas emitidas analisadas nota a nota
-- (ver equiparacao_hospitalar em notas_distribuidas, fase Z) pra saber se
-- entram na presunção reduzida (8% IRPJ / 12% CSLL). Sem essa marcação por
-- empresa, o checkbox por nota aparecia pra toda empresa em Lucro
-- Presumido, mesmo as que nunca prestam serviço equiparável a hospitalar.
alter table public.companies add column equiparacao_hospitalar boolean not null default false;
comment on column public.companies.equiparacao_hospitalar is 'Empresa (Lucro Presumido) cujas notas precisam ser analisadas pra equiparação hospitalar nota a nota.';
