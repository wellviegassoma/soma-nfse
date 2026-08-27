-- Dois novos papéis, cada um restrito a um único módulo novo (Legalização e
-- Extratos — ver fase_o_legalizacao e fase_p_extratos). Em migration
-- própria porque um valor de enum recém-adicionado não pode ser usado (em
-- função, policy, cast) na mesma transação em que foi criado — e cada
-- migration do Supabase roda como uma transação só.

alter type public.user_role add value 'ANALISTA_LEGALIZACAO';
alter type public.user_role add value 'ANALISTA_CONTABIL';
