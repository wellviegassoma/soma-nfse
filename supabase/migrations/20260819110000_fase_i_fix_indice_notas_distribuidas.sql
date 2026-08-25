-- Corrige notas_distribuidas_company_chave_idx: era um índice único
-- PARCIAL (where chave_acesso is not null), que o PostgREST não
-- consegue usar como alvo de "on_conflict" no upsert (Postgres exige
-- que a cláusula ON CONFLICT bata exatamente com o predicado do índice,
-- e o upsert do PostgREST não envia esse predicado) — descoberto porque
-- a sincronização reportava sucesso mas a tabela ficava vazia (upsert
-- falhando silenciosamente, sem checagem de erro no código; corrigido
-- também no route.ts). Um índice único comum já lida bem com múltiplos
-- NULLs (Postgres nunca considera NULL = NULL numa unique constraint),
-- então não precisa do "where" pra permitir documentos sem chave_acesso.

drop index if exists public.notas_distribuidas_company_chave_idx;
create unique index notas_distribuidas_company_chave_idx
  on public.notas_distribuidas(company_id, chave_acesso);
