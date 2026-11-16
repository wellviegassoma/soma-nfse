-- Fase BK: identificar a empresa do pedido de nota sem depender de telefone.
-- Ver docs/pedido-nota-ia.md ("Identificar a empresa").
--
-- Diagnóstico de 16/11/2026: company_contatos_setor não tem nenhum telefone
-- preenchido, e 25 de 34 conversas ativas no Digisac são GRUPOS de WhatsApp
-- (grupo não tem telefone de pessoa). O casamento por telefone da Fase 1
-- nunca achava empresa.
--
-- Nova ordem (lib/pedido-nota/empresa.ts):
--   1. CNPJ escrito no comentário ("#nota 12.345.678/0001-90")
--   2. vínculo aprendido: contato/grupo do Digisac → empresa (esta tabela)
--   3. telefone (company_contatos_setor), quando houver
--   4. nome do grupo/contato parecido com o nome de UMA empresa (sugestão,
--      com alerta no rascunho)
-- Os passos 1 e "empresa escolhida no painel" gravam o vínculo; o próximo
-- "#nota" daquele grupo já sai com a empresa certa.

create table public.pedido_nota_vinculos (
  id uuid primary key default gen_random_uuid(),
  origem text not null default 'DIGISAC' check (origem in ('DIGISAC')),
  origem_contact_id text not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  fonte text not null check (fonte in ('CNPJ_COMANDO', 'PAINEL')),
  -- Só para auditoria: de qual pedido saiu o vínculo.
  pedido_id uuid references public.pedidos_nota(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (origem, origem_contact_id)
);
comment on table public.pedido_nota_vinculos is
  'Contato ou grupo do Digisac → empresa, aprendido quando o atendente informa o CNPJ no #nota ou escolhe a empresa no painel. Um grupo de WhatsApp por cliente é o padrão da SOMA.';
create index pedido_nota_vinculos_company_id_idx on public.pedido_nota_vinculos(company_id);

create trigger pedido_nota_vinculos_set_updated_at before update on public.pedido_nota_vinculos
  for each row execute function public.set_updated_at();

alter table public.pedido_nota_vinculos enable row level security;

create policy pedido_nota_vinculos_all on public.pedido_nota_vinculos
  for all using (public.is_soma_staff() or public.is_atendimento_analista())
  with check (public.is_soma_staff() or public.is_atendimento_analista());

-- De onde veio a empresa do pedido (mostrado no painel; NOME_CONTATO gera
-- alerta "confira a empresa" nos rascunhos).
alter table public.pedidos_nota
  add column if not exists empresa_fonte text
    check (empresa_fonte in ('CNPJ_COMANDO', 'VINCULO', 'TELEFONE', 'NOME_CONTATO', 'PAINEL')),
  add column if not exists contato_eh_grupo boolean;
