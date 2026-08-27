-- Cadastro de conta bancária passa a sugerir o banco de uma lista (código +
-- nome, mesmo padrão COMPE/Febraban) em vez de digitar o nome livre — guarda
-- o código junto pra referência futura. Nullable porque contas já
-- cadastradas antes disso não têm o código.
alter table public.extrato_contas_bancarias add column codigo_banco text;
