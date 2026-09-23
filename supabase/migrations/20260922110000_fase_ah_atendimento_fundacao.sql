-- Módulo Atendimento: inbox de WhatsApp da própria SOMA (contabilidade),
-- não das empresas clientes — atendentes internos conversam com clientes e
-- leads pelo WhatsApp da SOMA, com fila/roteamento por departamento. Mesmo
-- padrão de acesso de Legalização/Extratos: só staff + analista do módulo
-- (is_soma_staff() or is_atendimento_analista()), sem isolamento por
-- empresa — cliente nunca loga nessas telas. `company_id` em
-- atendimento_contatos é só um vínculo opcional (auto-casado por telefone
-- via a função atendimento_buscar_company_id_por_telefone, chamada pelo
-- whatsapp-connector/src/baileys.js) pra dar contexto ao atendente, nunca
-- controla RLS.
--
-- Levantamento feito em 22/09/2026 navegando o Digisac real (conta SOMA
-- Contabilidade Integrada, gruposoma.digisac.co) — ver docs/atendimento.md.

create or replace function public.is_atendimento_analista()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_companies
    where user_id = auth.uid() and role = 'ANALISTA_ATENDIMENTO'
  );
$$;

-- ---------------------------------------------------------------------------
-- Departamentos (setores internos da SOMA que recebem chamado)
-- ---------------------------------------------------------------------------

create table public.atendimento_departamentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.atendimento_departamentos is
  'Setor interno da SOMA que recebe chamado (Fiscal, Financeiro, DP...). Inativar em vez de apagar quando já houver ticket nele (on delete restrict em atendimento_tickets.departamento_id).';

create trigger atendimento_departamentos_set_updated_at before update on public.atendimento_departamentos
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Conexões (números de WhatsApp conectados)
-- ---------------------------------------------------------------------------

create table public.atendimento_conexoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null default 'BAILEYS' check (tipo in ('BAILEYS', 'CLOUD_API')),
  numero text,
  status text not null default 'DESCONECTADO' check (status in ('DESCONECTADO', 'PAREANDO', 'CONECTADO')),
  departamento_padrao_id uuid references public.atendimento_departamentos(id) on delete set null,
  qr_code text,
  conectado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.atendimento_conexoes is
  'Um número de WhatsApp. Credencial de sessão do Baileys NUNCA entra aqui — fica só no disco/volume do whatsapp-connector (ver README do serviço). Esta tabela guarda status/QR pra exibir na tela, nada que autentique sozinho.';

create trigger atendimento_conexoes_set_updated_at before update on public.atendimento_conexoes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Contatos (quem manda mensagem)
-- ---------------------------------------------------------------------------

create table public.atendimento_contatos (
  id uuid primary key default gen_random_uuid(),
  conexao_id uuid not null references public.atendimento_conexoes(id) on delete cascade,
  telefone text not null,
  nome text,
  avatar_url text,
  company_id uuid references public.companies(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conexao_id, telefone)
);
comment on table public.atendimento_contatos is
  'company_id é preenchido por auto-match de telefone contra company_contatos_setor/tomadores — só contexto pro atendente, nunca obrigatório: leads e ex-clientes não têm company_id.';
create index atendimento_contatos_company_id_idx on public.atendimento_contatos(company_id);
create index atendimento_contatos_telefone_idx on public.atendimento_contatos(telefone);

create trigger atendimento_contatos_set_updated_at before update on public.atendimento_contatos
  for each row execute function public.set_updated_at();

-- Auto-match por telefone: compara só os últimos 8 dígitos (ignora DDI e o
-- 9º dígito, que variam entre como o WhatsApp manda o número e como está
-- digitado em company_contatos_setor) — heurística suficiente pro
-- contexto do atendente, nunca usada em RLS nem em nenhuma decisão que
-- precise de certeza. Fica em SQL (não em JS) pra evitar que o
-- whatsapp-connector precise puxar a tabela inteira pela rede a cada
-- contato novo — achado na revisão do PR (o código antigo fazia
-- `select *` em company_contatos_setor e filtrava em memória no Node).
create or replace function public.atendimento_buscar_company_id_por_telefone(p_telefone text)
returns uuid
language sql
stable
as $$
  select company_id
  from public.company_contatos_setor
  where telefone is not null
    and right(regexp_replace(telefone, '\D', '', 'g'), 8) = right(regexp_replace(p_telefone, '\D', '', 'g'), 8)
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Tickets (chamado)
-- ---------------------------------------------------------------------------

-- Contador por ano (não uma sequence única) — achado na revisão do PR: uma
-- sequence global nunca reinicia, então o protocolo de janeiro/2027 saía
-- "2027-004501" em vez de "2027-000001" se 2026 tivesse terminado em 4500.
-- `insert ... on conflict do update ... returning` é atômico por linha
-- (o lock da linha do ano serializa chamadas concorrentes), sem precisar
-- de uma sequence nova por ano.
create table public.atendimento_protocolo_contador (
  ano int primary key,
  ultimo int not null default 0
);

create or replace function public.atendimento_gerar_protocolo()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ano int := extract(year from now());
  v_proximo int;
begin
  insert into public.atendimento_protocolo_contador (ano, ultimo)
  values (v_ano, 1)
  on conflict (ano) do update set ultimo = public.atendimento_protocolo_contador.ultimo + 1
  returning ultimo into v_proximo;

  return v_ano::text || '-' || lpad(v_proximo::text, 6, '0');
end;
$$;

create table public.atendimento_tickets (
  id uuid primary key default gen_random_uuid(),
  protocolo text not null unique default public.atendimento_gerar_protocolo(),
  contato_id uuid not null references public.atendimento_contatos(id) on delete cascade,
  departamento_id uuid not null references public.atendimento_departamentos(id) on delete restrict,
  atendente_id uuid references public.profiles(id) on delete set null,
  status text not null default 'FILA' check (status in ('FILA', 'ABERTO', 'FECHADO')),
  aberto_em timestamptz not null default now(),
  fechado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.atendimento_tickets is
  'Um atendimento de um contato. Fica em FILA sem atendente até alguém assumir; ABERTO com atendente_id; FECHADO com fechado_em preenchido. Histórico de transferência mora em atendimento_transferencias, não aqui.';
create index atendimento_tickets_contato_id_idx on public.atendimento_tickets(contato_id);
create index atendimento_tickets_departamento_id_idx on public.atendimento_tickets(departamento_id);
create index atendimento_tickets_atendente_id_idx on public.atendimento_tickets(atendente_id);
create index atendimento_tickets_status_idx on public.atendimento_tickets(status);

create trigger atendimento_tickets_set_updated_at before update on public.atendimento_tickets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Mensagens
-- ---------------------------------------------------------------------------

create table public.atendimento_mensagens (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.atendimento_tickets(id) on delete cascade,
  remetente_tipo text not null check (remetente_tipo in ('CONTATO', 'ATENDENTE', 'SISTEMA', 'BOT')),
  atendente_id uuid references public.profiles(id) on delete set null,
  corpo text,
  midia_url text,
  midia_tipo text,
  interno boolean not null default false,
  whatsapp_message_id text,
  status text not null default 'RECEBIDA' check (status in ('ENVIANDO', 'ENVIADA', 'ENTREGUE', 'LIDA', 'RECEBIDA', 'FALHOU')),
  created_at timestamptz not null default now()
);
comment on table public.atendimento_mensagens is
  'interno=true é a nota interna (comentário que não vai pro WhatsApp) — mesma tabela, pra aparecer na linha do tempo do ticket na ordem certa, mas remetente_tipo continua ATENDENTE.';
create index atendimento_mensagens_ticket_id_idx on public.atendimento_mensagens(ticket_id, created_at);
-- Idempotência: se o Baileys reenviar o mesmo evento (comum depois de uma
-- reconexão) ou a retentativa do whatsapp-connector rodar duas vezes por
-- causa de uma falha de rede na resposta (não na gravação), o segundo
-- insert com o mesmo whatsapp_message_id vira erro 23505 em vez de
-- duplicar a mensagem — ver encontrarOuCriarContato/registrarMensagemRecebida
-- em whatsapp-connector/src/baileys.js. Parcial (where not null) porque
-- toda mensagem ENVIANDO por um atendente nasce sem whatsapp_message_id.
create unique index atendimento_mensagens_whatsapp_message_id_idx
  on public.atendimento_mensagens(whatsapp_message_id)
  where whatsapp_message_id is not null;

-- ---------------------------------------------------------------------------
-- Transferências (auditoria)
-- ---------------------------------------------------------------------------

create table public.atendimento_transferencias (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.atendimento_tickets(id) on delete cascade,
  de_departamento_id uuid references public.atendimento_departamentos(id) on delete set null,
  para_departamento_id uuid not null references public.atendimento_departamentos(id) on delete restrict,
  de_atendente_id uuid references public.profiles(id) on delete set null,
  para_atendente_id uuid references public.profiles(id) on delete set null,
  comentario text not null,
  created_at timestamptz not null default now()
);
comment on table public.atendimento_transferencias is
  'Comentário é obrigatório de propósito — achado real navegando o Digisac: é o único jeito de quem recebe o chamado saber o contexto sem reler a conversa inteira.';
create index atendimento_transferencias_ticket_id_idx on public.atendimento_transferencias(ticket_id);

-- ---------------------------------------------------------------------------
-- Tags e respostas rápidas
-- ---------------------------------------------------------------------------

create table public.atendimento_tags (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  cor text not null default '#6b7280',
  created_at timestamptz not null default now()
);

create table public.atendimento_contato_tags (
  contato_id uuid not null references public.atendimento_contatos(id) on delete cascade,
  tag_id uuid not null references public.atendimento_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (contato_id, tag_id)
);

create table public.atendimento_respostas_rapidas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  corpo text not null,
  departamento_id uuid references public.atendimento_departamentos(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger atendimento_respostas_rapidas_set_updated_at before update on public.atendimento_respostas_rapidas
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — módulo exclusivo de staff SOMA + analista de
-- atendimento, mesmo padrão de Legalização/Extratos (cliente nunca vê).
-- ---------------------------------------------------------------------------

alter table public.atendimento_protocolo_contador enable row level security;
alter table public.atendimento_departamentos enable row level security;
alter table public.atendimento_conexoes enable row level security;
alter table public.atendimento_contatos enable row level security;
alter table public.atendimento_tickets enable row level security;
alter table public.atendimento_mensagens enable row level security;
alter table public.atendimento_transferencias enable row level security;
alter table public.atendimento_tags enable row level security;
alter table public.atendimento_contato_tags enable row level security;
alter table public.atendimento_respostas_rapidas enable row level security;

create policy atendimento_protocolo_contador_all on public.atendimento_protocolo_contador
  for all using (public.is_soma_staff() or public.is_atendimento_analista())
  with check (public.is_soma_staff() or public.is_atendimento_analista());
create policy atendimento_departamentos_all on public.atendimento_departamentos
  for all using (public.is_soma_staff() or public.is_atendimento_analista())
  with check (public.is_soma_staff() or public.is_atendimento_analista());
create policy atendimento_conexoes_all on public.atendimento_conexoes
  for all using (public.is_soma_staff() or public.is_atendimento_analista())
  with check (public.is_soma_staff() or public.is_atendimento_analista());
create policy atendimento_contatos_all on public.atendimento_contatos
  for all using (public.is_soma_staff() or public.is_atendimento_analista())
  with check (public.is_soma_staff() or public.is_atendimento_analista());
create policy atendimento_tickets_all on public.atendimento_tickets
  for all using (public.is_soma_staff() or public.is_atendimento_analista())
  with check (public.is_soma_staff() or public.is_atendimento_analista());
create policy atendimento_mensagens_all on public.atendimento_mensagens
  for all using (public.is_soma_staff() or public.is_atendimento_analista())
  with check (public.is_soma_staff() or public.is_atendimento_analista());
create policy atendimento_transferencias_all on public.atendimento_transferencias
  for all using (public.is_soma_staff() or public.is_atendimento_analista())
  with check (public.is_soma_staff() or public.is_atendimento_analista());
create policy atendimento_tags_all on public.atendimento_tags
  for all using (public.is_soma_staff() or public.is_atendimento_analista())
  with check (public.is_soma_staff() or public.is_atendimento_analista());
create policy atendimento_contato_tags_all on public.atendimento_contato_tags
  for all using (public.is_soma_staff() or public.is_atendimento_analista())
  with check (public.is_soma_staff() or public.is_atendimento_analista());
create policy atendimento_respostas_rapidas_all on public.atendimento_respostas_rapidas
  for all using (public.is_soma_staff() or public.is_atendimento_analista())
  with check (public.is_soma_staff() or public.is_atendimento_analista());

-- ---------------------------------------------------------------------------
-- Realtime — inbox precisa atualizar sozinho quando chega mensagem/ticket.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.atendimento_tickets;
alter publication supabase_realtime add table public.atendimento_mensagens;
-- Sem esta linha (achado na revisão do PR), a tela de Conexões nunca
-- atualiza sozinha quando o whatsapp-connector grava o QR Code/status —
-- ConexaoCard.tsx assina postgres_changes nesta tabela especificamente.
alter publication supabase_realtime add table public.atendimento_conexoes;

-- ---------------------------------------------------------------------------
-- Seed: departamentos levantados no Digisac real (22/09/2026)
-- ---------------------------------------------------------------------------

insert into public.atendimento_departamentos (nome) values
  ('Atendimento ao Cliente'),
  ('Comercial'),
  ('Contabilidade'),
  ('Departamento Pessoal'),
  ('Diretoria'),
  ('Emissão de Nota Fiscal'),
  ('Financeiro'),
  ('Fiscal'),
  ('Jurídico'),
  ('Legalização'),
  ('Pessoa Física - CPF - Carnê Leão');
