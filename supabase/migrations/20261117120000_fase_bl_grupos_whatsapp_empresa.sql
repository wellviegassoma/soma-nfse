-- Fase BL: grupo do WhatsApp (Digisac) cadastrado na empresa, muitos-para-muitos.
-- Ver docs/pedido-nota-ia.md ("Identificar a empresa").
--
-- Pedido do usuário em 16/11/2026: em vez de só adivinhar a empresa pelo nome
-- do grupo, o cadastro da empresa (Dados fiscais) diz qual(is) grupo(s) é(são)
-- dela. Um grupo pode atender VÁRIAS empresas (ex.: "SOMA + BFM" atende BFM
-- Diagnóstico, BFM Participações e o Dr. Bruno PF) e uma empresa pode ter
-- vários grupos (fiscal e DP separados, grupo antigo). Por isso o vínculo
-- deixa de ser único por contato e passa a ser único por (contato, empresa).
--
-- Com mais de uma empresa no grupo, a IA escolhe pela conversa
-- (empresa_fonte = GRUPO_IA, com aviso no rascunho); sem certeza, o painel
-- mostra só as empresas daquele grupo.

alter table public.pedido_nota_vinculos
  drop constraint if exists pedido_nota_vinculos_origem_origem_contact_id_key;
alter table public.pedido_nota_vinculos
  add constraint pedido_nota_vinculos_contato_empresa_key unique (origem, origem_contact_id, company_id);
create index if not exists pedido_nota_vinculos_contato_idx
  on public.pedido_nota_vinculos(origem, origem_contact_id);

-- Nome do grupo quando foi vinculado (só para exibir; o vínculo é pelo id do
-- contato no Digisac, então sobrevive a renomear o grupo).
alter table public.pedido_nota_vinculos add column if not exists grupo_nome text;

-- CADASTRO = escolhido na tela da empresa; NOME_INICIAL = preenchimento
-- inicial pelos nomes idênticos "SOMA + nome no sistema".
alter table public.pedido_nota_vinculos drop constraint if exists pedido_nota_vinculos_fonte_check;
alter table public.pedido_nota_vinculos
  add constraint pedido_nota_vinculos_fonte_check
  check (fonte in ('CNPJ_COMANDO', 'PAINEL', 'CADASTRO', 'NOME_INICIAL'));

alter table public.pedidos_nota drop constraint if exists pedidos_nota_empresa_fonte_check;
alter table public.pedidos_nota
  add constraint pedidos_nota_empresa_fonte_check
  check (empresa_fonte in ('CNPJ_COMANDO', 'VINCULO', 'GRUPO_IA', 'TELEFONE', 'NOME_CONTATO', 'PAINEL'));

comment on table public.pedido_nota_vinculos is
  'Grupo/contato do Digisac ↔ empresa (muitos-para-muitos). Editado na tela Dados fiscais da empresa ("Grupos do WhatsApp"), pelo #nota com CNPJ e pela escolha no painel de pedidos de nota.';
