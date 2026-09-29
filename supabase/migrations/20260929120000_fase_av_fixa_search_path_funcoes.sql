-- Fase AV — Fixa search_path das 3 funções apontadas pelo Security Advisor
-- do Supabase (lint 0011_function_search_path_mutable). Sem search_path
-- fixo, uma role com privilégio de CREATE em algum schema poderia criar um
-- objeto homônimo (ex.: uma função "now()" própria) em outro schema à
-- frente no search_path da sessão e a função acabaria chamando esse objeto
-- forjado em vez do real. Não muda comportamento nenhum aqui — só fixa o
-- schema de resolução.
alter function public.set_updated_at() set search_path = public;
alter function public.atendimento_buscar_company_id_por_telefone(text) set search_path = public;
alter function public.permissoes_do_papel_legado(user_role) set search_path = public;
