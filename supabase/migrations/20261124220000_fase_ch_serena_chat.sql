-- Fase CH: conversa com a Serena (aba lateral na tela da Serena, 24/11/2026).
--
-- serena_mensagens: histórico da conversa de cada pessoa com a Serena.
-- serena_propostas: ações que mudam dado (ex.: classificar serviços na
-- atividade do Simples) — a Serena prepara, a pessoa confirma com um clique;
-- só então o sistema aplica (e registra quem confirmou).

create table if not exists public.serena_mensagens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  proposta_ids uuid[],
  ferramentas text[],
  created_at timestamptz not null default now()
);
create index if not exists serena_mensagens_user_idx on public.serena_mensagens(user_id, created_at);

create table if not exists public.serena_propostas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null check (tipo in ('CLASSIFICAR_SERVICOS')),
  titulo text not null,
  itens jsonb not null,            -- [{id, rotulo, de, para, motivo, ...}]
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'APLICADA', 'DESCARTADA')),
  aplicados text[],                 -- ids dos itens efetivamente aplicados
  criada_em timestamptz not null default now(),
  decidida_em timestamptz,
  decidida_por uuid references public.profiles(id) on delete set null
);

alter table public.serena_mensagens enable row level security;
alter table public.serena_propostas enable row level security;

-- Cada pessoa vê só a própria conversa; propostas, a equipe toda.
drop policy if exists serena_mensagens_proprias on public.serena_mensagens;
create policy serena_mensagens_proprias on public.serena_mensagens
  for all using ((select public.is_soma_staff()) and user_id = (select auth.uid()))
  with check ((select public.is_soma_staff()) and user_id = (select auth.uid()));
drop policy if exists serena_propostas_all on public.serena_propostas;
create policy serena_propostas_all on public.serena_propostas
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
