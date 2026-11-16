-- Fase BJ: pedido de nota via WhatsApp (Digisac) → rascunho por IA → aprovação → emissão.
-- Ver docs/pedido-nota-ia.md.
--
-- O atendente continua atendendo no Digisac. Quando a conversa é um pedido de
-- nota, ele manda um comentário interno "#nota" no chamado; o webhook
-- message.created do Digisac chega em /api/digisac/webhook, que grava aqui o
-- pedido com as mensagens do cliente daquele chamado e os anexos (copiados
-- para o Vercel Blob privado — a URL de arquivo do Digisac abre sem
-- autenticação, então nunca é guardada).
--
-- Fase 1 (esta migration) só RECEBE o pedido. pedido_nota_itens já nasce aqui
-- para a Fase 2 (IA monta os rascunhos) e a Fase 3 (painel de aprovação) não
-- precisarem de outra migration estrutural.
--
-- Acesso: mesmo padrão do módulo Atendimento (staff SOMA + analista de
-- atendimento). O webhook grava com service role.

-- ---------------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------------

create table public.pedidos_nota (
  id uuid primary key default gen_random_uuid(),
  origem text not null default 'DIGISAC' check (origem in ('DIGISAC')),
  -- Mensagem do comentário "#nota" que disparou o pedido: chave de idempotência
  -- (o Digisac pode reenviar o mesmo webhook; message.updated também chega).
  origem_comando_message_id text not null,
  origem_ticket_id text not null,
  origem_contact_id text not null,
  origem_service_id text,
  -- Quem mandou o "#nota" no Digisac (id de usuário do Digisac).
  origem_user_id text,
  -- Texto do comentário depois de "#nota" — dica do atendente para a IA
  -- (ex.: "3500 consultoria").
  dica_atendente text,
  telefone text,
  contato_nome text,
  company_id uuid references public.companies(id) on delete set null,
  -- Mais de uma empresa com esse telefone: o painel pede para escolher.
  companies_candidatas uuid[] not null default '{}',
  status text not null default 'RECEBIDO' check (status in (
    'RECEBIDO',              -- mensagens e anexos capturados
    'EXTRAINDO',             -- IA montando rascunho (Fase 2)
    'AGUARDANDO_APROVACAO',  -- rascunho pronto no painel (Fase 3)
    'EMITINDO',
    'EMITIDA',
    'PARCIAL',               -- parte dos itens emitidos
    'ERRO',
    'DESCARTADO'
  )),
  -- [{ id, timestamp, tipo, texto, anexo_index }] — só mensagens do cliente
  -- (isFromMe=false, sem comentários), em ordem cronológica.
  mensagens jsonb not null default '[]'::jsonb,
  -- [{ message_id, pathname, nome, mimetype, bytes }] — Vercel Blob privado.
  anexos jsonb not null default '[]'::jsonb,
  ia_modelo text,
  ia_tokens_entrada int,
  ia_tokens_saida int,
  ia_custo_usd numeric(10, 5),
  erro text,
  descartado_motivo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (origem, origem_comando_message_id)
);
comment on table public.pedidos_nota is
  'Pedido de NFS-e sinalizado pelo atendente no Digisac (comentário #nota). Ver docs/pedido-nota-ia.md. anexos guarda pathname do Vercel Blob privado — nunca a URL pública do Digisac.';
create index pedidos_nota_status_idx on public.pedidos_nota(status, created_at);
create index pedidos_nota_company_id_idx on public.pedidos_nota(company_id);
create index pedidos_nota_ticket_idx on public.pedidos_nota(origem, origem_ticket_id);

create trigger pedidos_nota_set_updated_at before update on public.pedidos_nota
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Itens (uma nota cada — um pedido pode virar várias)
-- ---------------------------------------------------------------------------

create table public.pedido_nota_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos_nota(id) on delete cascade,
  ordem int not null default 0,
  status text not null default 'RASCUNHO' check (status in ('RASCUNHO', 'APROVADO', 'EMITIDO', 'ERRO', 'DESCARTADO')),
  customer_id uuid references public.customers(id) on delete set null,
  -- Tomador ainda não cadastrado (a IA achou documento/nome na mensagem).
  tomador_documento text,
  tomador_nome text,
  service_id uuid references public.services(id) on delete set null,
  valor numeric(14, 2),
  descricao text,
  competencia date,
  iss_retido boolean,
  aliquota_iss numeric(6, 3),
  irrf_pct numeric(6, 3),
  csrf_pct numeric(6, 3),
  inss_pct numeric(6, 3),
  confianca text check (confianca in ('ALTA', 'MEDIA', 'BAIXA')),
  -- [{ codigo, mensagem }] — tomador novo, valor fora do padrão, duplicidade...
  alertas jsonb not null default '[]'::jsonb,
  -- { campo: "trecho da mensagem de onde saiu" } — mostrado no painel.
  trecho_origem jsonb not null default '{}'::jsonb,
  pergunta_ao_cliente text,
  editado_pelo_humano boolean not null default false,
  aprovado_por uuid references public.profiles(id) on delete set null,
  aprovado_em timestamptz,
  dps_id uuid references public.dps(id) on delete set null,
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.pedido_nota_itens is
  'Rascunho de uma NFS-e dentro de um pedido_nota. Só vira nota por aprovação humana (aprovado_por) — ver docs/pedido-nota-ia.md, Fase 3.';
create index pedido_nota_itens_pedido_id_idx on public.pedido_nota_itens(pedido_id, ordem);
create index pedido_nota_itens_dps_id_idx on public.pedido_nota_itens(dps_id);

create trigger pedido_nota_itens_set_updated_at before update on public.pedido_nota_itens
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Empresas por telefone (todas, não só a primeira)
-- ---------------------------------------------------------------------------

-- Mesma heurística de atendimento_buscar_company_id_por_telefone (últimos 8
-- dígitos — ignora DDI e o 9º dígito), mas devolve TODAS as empresas: um
-- contador/sócio que cuida de várias empresas usa o mesmo WhatsApp, e emitir
-- nota na empresa errada é pior do que perguntar.
create or replace function public.pedido_nota_empresas_por_telefone(p_telefone text)
returns setof uuid
language sql
stable
set search_path = public
as $$
  select distinct company_id
  from public.company_contatos_setor
  where telefone is not null
    and length(regexp_replace(p_telefone, '\D', '', 'g')) >= 8
    and right(regexp_replace(telefone, '\D', '', 'g'), 8) = right(regexp_replace(p_telefone, '\D', '', 'g'), 8);
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.pedidos_nota enable row level security;
alter table public.pedido_nota_itens enable row level security;

create policy pedidos_nota_all on public.pedidos_nota
  for all using (public.is_soma_staff() or public.is_atendimento_analista())
  with check (public.is_soma_staff() or public.is_atendimento_analista());

create policy pedido_nota_itens_all on public.pedido_nota_itens
  for all using (public.is_soma_staff() or public.is_atendimento_analista())
  with check (public.is_soma_staff() or public.is_atendimento_analista());
