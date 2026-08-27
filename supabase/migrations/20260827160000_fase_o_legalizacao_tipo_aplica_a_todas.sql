-- Até aqui, todo tipo novo aparecia automaticamente pra todas as 206
-- empresas, e quem cadastra tinha que ir empresa por empresa desmarcar as
-- que não precisam (inviável pra um tipo de nicho, tipo CNES, que só se
-- aplica a poucas empresas de saúde). Agora cada tipo escolhe o próprio
-- padrão: `aplica_a_todas = true` (comportamento de hoje — Alvará,
-- Certidão, ...) ou `false` (ninguém tem por padrão; staff escolhe as
-- empresas que precisam, direto da tela do tipo).
alter table public.legalizacao_tipos_documento
  add column aplica_a_todas boolean not null default true;

-- A tabela de exceções deixa de significar só "não aplicável" e passa a
-- guardar a exceção explícita nos dois sentidos: quando o tipo tem
-- aplica_a_todas=true, uma linha com aplicavel=false EXCLUI a empresa;
-- quando aplica_a_todas=false, uma linha com aplicavel=true INCLUI a
-- empresa. Ausência de linha sempre significa "usa o padrão do tipo".
alter table public.legalizacao_tipos_nao_aplicaveis
  rename to legalizacao_tipos_empresas_excecao;

alter table public.legalizacao_tipos_empresas_excecao
  add column aplicavel boolean not null default false;

alter index idx_legalizacao_tipos_nao_aplicaveis_company
  rename to idx_legalizacao_tipos_empresas_excecao_company;
alter index idx_legalizacao_tipos_nao_aplicaveis_tipo
  rename to idx_legalizacao_tipos_empresas_excecao_tipo;
alter policy legalizacao_tipos_nao_aplicaveis_all
  on public.legalizacao_tipos_empresas_excecao
  rename to legalizacao_tipos_empresas_excecao_all;
