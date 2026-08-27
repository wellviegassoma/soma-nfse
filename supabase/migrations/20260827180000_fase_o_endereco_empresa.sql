-- Até aqui a empresa só guardava o código IBGE do município (usado só pra
-- achar a alíquota de ISS na hora de emitir), sem nenhum campo de endereço
-- nem nome legível de cidade/UF em lugar nenhum do sistema. Preenchidos a
-- partir dos mesmos dados públicos da Receita Federal já usados no cadastro
-- (ver lib/cnpj-lookup.ts) — nem toda empresa tem CNPJ ativo/encontrado na
-- Receita, então todos os campos ficam opcionais.
alter table public.companies
  add column address_street text,
  add column address_number text,
  add column address_complement text,
  add column address_neighborhood text,
  add column address_zip text,
  add column municipality_name text,
  add column state text;
