-- Fix de performance urgente: desde a virada de RLS (fase AM), consultas
-- paginadas em tabelas grandes (dps, notas_distribuidas) começaram a dar
-- "canceling statement due to statement timeout" — confirmado ao vivo
-- reproduzindo o mesmo erro que apareceu no painel do Supabase (taxa de
-- erro 5xx da Data API).
--
-- Causa: tem_acesso_empresa(company_id), chamada pela RLS uma vez por
-- linha da tabela (nenhuma função security definer é inlinable pelo
-- planner), faz um lookup em usuario_permissoes por (user_id, company_id)
-- sem um índice que cubra exatamente essas duas colunas — os dois índices
-- existentes são parciais (company_id is null / is not null) e o planner
-- não consegue provar em tempo de planejamento que o parâmetro passado é
-- not null, então não os usa. O índice antigo equivalente (user_companies,
-- chave primária (user_id, company_id)) sempre foi um lookup instantâneo;
-- este índice novo restaura a mesma característica pra usuario_permissoes.
create index if not exists usuario_permissoes_user_company_idx
  on public.usuario_permissoes (user_id, company_id);
