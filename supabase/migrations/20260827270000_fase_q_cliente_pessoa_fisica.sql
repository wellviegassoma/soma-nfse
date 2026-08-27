-- Cliente Pessoa Física — mesma dualidade CPF/CNPJ que já existe pra
-- customers (tomador), agora também pro cadastro geral (companies), pra
-- suportar autônomo que emite NFS-e como profissional autônomo
-- (regEspTrib = 5, já existente no domínio da DPS).
alter table public.companies
  add column person_type public.customer_type not null default 'PJ',
  add column cpf text unique;

alter table public.companies
  add constraint companies_documento_por_tipo check (
    (person_type = 'PJ' and cpf is null) or
    (person_type = 'PF' and cnpj is null)
  );
