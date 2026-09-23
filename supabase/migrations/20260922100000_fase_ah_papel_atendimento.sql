-- Papel novo para o módulo de Atendimento (WhatsApp) — em migration própria
-- porque um valor de enum recém-adicionado não pode ser usado (em função,
-- policy, cast) na mesma transação em que foi criado, mesmo motivo já
-- documentado em fase_o_papeis_analistas e fase_aa_papel_financeiro.

alter type public.user_role add value 'ANALISTA_ATENDIMENTO';
