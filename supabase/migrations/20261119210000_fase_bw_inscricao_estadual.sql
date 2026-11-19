-- Fase BW: inscrição estadual nos dados fiscais do cliente (pedido de
-- 19/11/2026). Preenchida pela leitura do DeC da SEFAZ-RJ (o número vem nas
-- mensagens já lidas) ou à mão na tela de dados fiscais. 'ISENTO' = a SEFAZ-RJ
-- respondeu que o CNPJ não consta no cadastro de ICMS. Vazio = ainda não
-- verificado. O DeC só é lido para quem não está 'ISENTO'.
alter table public.companies
  add column if not exists inscricao_estadual text;

comment on column public.companies.inscricao_estadual is
  'Inscrição estadual (só dígitos) ou ISENTO; null = não verificado.';
