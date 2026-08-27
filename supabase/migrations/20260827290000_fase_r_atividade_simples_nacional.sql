-- Fase R (cont.) — Atividade do Simples Nacional por serviço, em vez de
-- só a flag sujeito_fator_r por empresa inteira: um CNPJ pode ter
-- serviços que sempre caem no Anexo III (ex.: ensino) e outros que
-- dependem do teste do Fator R (ex.: medicina) ao mesmo tempo. Valores
-- válidos vêm de frontend/src/lib/simples-nacional-atividades.ts (ids
-- citando LC 123/2006, art. 18, §§5º-B a 5º-M) — não é enum de banco de
-- propósito, pra não exigir migration toda vez que a lei mudar ou a lista
-- crescer; a validação de "id existe" fica na aplicação.

alter table public.services
  add column atividade_simples_nacional text;

comment on column public.services.atividade_simples_nacional is
  'Id de ATIVIDADES_SIMPLES_NACIONAL (frontend/src/lib/simples-nacional-atividades.ts) — decide Anexo III fixo, Fator R, ou Anexo IV fixo pra esse serviço especificamente. Nulo = ainda não classificado.';
