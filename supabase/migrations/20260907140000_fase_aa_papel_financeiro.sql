-- Papel do módulo Financeiro (ver fase_aa_financeiro_fundacao e
-- docs/financeiro.md). Em migration própria pelo mesmo motivo já
-- documentado em fase_o_papeis_analistas: um valor de enum recém-adicionado
-- não pode ser usado (em função, policy, cast) na mesma transação em que foi
-- criado — e cada migration do Supabase roda como uma transação só.

alter type public.user_role add value 'ANALISTA_FINANCEIRO';
