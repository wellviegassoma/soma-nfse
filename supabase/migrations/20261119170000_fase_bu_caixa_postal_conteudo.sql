-- Fase BU: conteúdo da mensagem da Caixa Postal dentro do SOMA (pedido de
-- 19/11/2026). Lido com CAIXAPOSTAL.MSGDETALHAMENTO62, que DÁ CIÊNCIA da
-- intimação (igual a abrir no e-CAC) — só quando alguém da equipe confirma
-- na tela. Guardado aqui para ninguém precisar chamar de novo (custo) e
-- para registrar quem deu ciência pelo SOMA.
alter table public.caixa_postal_mensagens
  add column if not exists corpo text,
  add column if not exists corpo_lido_em timestamptz,
  add column if not exists corpo_lido_por uuid references public.profiles(id) on delete set null;
