-- Três pedidos direto de uso real, testando com o Digisac como
-- referência: (1) assunto do chamado + resumo na confirmação de
-- fechamento, (2) filtrar "transferir para atendente" por quem é do
-- departamento, (3) iniciar chamado escolhendo um contato do WhatsApp em
-- vez de esperar ele mandar mensagem primeiro.

-- ---------------------------------------------------------------------------
-- Assunto do chamado (categorização pro fechamento — diferente de
-- departamento, que é "quem atende")
-- ---------------------------------------------------------------------------

create table public.atendimento_assuntos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.atendimento_assuntos enable row level security;
create policy atendimento_assuntos_all on public.atendimento_assuntos
  for all using (public.is_soma_staff() or public.is_atendimento_analista())
  with check (public.is_soma_staff() or public.is_atendimento_analista());

insert into public.atendimento_assuntos (nome) values
  ('Dúvida'),
  ('Cobrança'),
  ('Suporte técnico'),
  ('Documentos'),
  ('Outros');

alter table public.atendimento_tickets
  add column assunto_id uuid references public.atendimento_assuntos(id) on delete set null,
  add column resumo text;

-- ---------------------------------------------------------------------------
-- Quem pertence a qual departamento — só organiza o seletor de
-- "transferir para atendente" (não restringe RLS: staff e
-- ANALISTA_ATENDIMENTO continuam vendo tudo, igual antes). Nasce vazia —
-- sem membro cadastrado, o seletor cai pra mostrar todo mundo (ver
-- InboxShell/TicketChat); gerenciável por Supabase Studio por enquanto,
-- mesmo padrão de tags/respostas rápidas.
-- ---------------------------------------------------------------------------

create table public.atendimento_usuario_departamentos (
  user_id uuid not null references public.profiles(id) on delete cascade,
  departamento_id uuid not null references public.atendimento_departamentos(id) on delete cascade,
  primary key (user_id, departamento_id)
);
alter table public.atendimento_usuario_departamentos enable row level security;
create policy atendimento_usuario_departamentos_all on public.atendimento_usuario_departamentos
  for all using (public.is_soma_staff() or public.is_atendimento_analista())
  with check (public.is_soma_staff() or public.is_atendimento_analista());

-- ---------------------------------------------------------------------------
-- Cache dos contatos do WhatsApp (sincronizados pelo Baileys ao parear e
-- conforme mudam) — separado de atendimento_contatos de propósito:
-- atendimento_contatos representa quem já teve chamado; este aqui é só a
-- agenda inteira do número conectado, usada pra escolher com quem
-- iniciar uma conversa nova. Um vira o outro só quando o atendente
-- efetivamente inicia (ver /api/atendimento/tickets/iniciar).
-- ---------------------------------------------------------------------------

create table public.atendimento_contatos_whatsapp (
  conexao_id uuid not null references public.atendimento_conexoes(id) on delete cascade,
  jid text not null,
  nome text,
  telefone text,
  atualizado_em timestamptz not null default now(),
  primary key (conexao_id, jid)
);
create index atendimento_contatos_whatsapp_nome_idx on public.atendimento_contatos_whatsapp(nome);
alter table public.atendimento_contatos_whatsapp enable row level security;
create policy atendimento_contatos_whatsapp_all on public.atendimento_contatos_whatsapp
  for all using (public.is_soma_staff() or public.is_atendimento_analista())
  with check (public.is_soma_staff() or public.is_atendimento_analista());
