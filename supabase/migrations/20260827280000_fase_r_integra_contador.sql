-- Fase R — Integra Contador: cadastro de contribuintes habilitados, cache
-- de respostas e log de uso do conector com a API Integra Contador
-- (Serpro). O serviço em integra-contador/ acessa essas tabelas via
-- service role (ignora RLS) — as políticas abaixo só valem pra acesso
-- futuro via frontend/dashboard.

-- ---------------------------------------------------------------------------
-- integra_contador_contribuintes: quais companies entram nos pulls do
-- Integra Contador. Reaproveita public.companies — não duplica cadastro.
-- ---------------------------------------------------------------------------

create table public.integra_contador_contribuintes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  ativo boolean not null default true,
  procuracao_status text,
  procuracao_verificada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger integra_contador_contribuintes_set_updated_at
  before update on public.integra_contador_contribuintes
  for each row execute function public.set_updated_at();

alter table public.integra_contador_contribuintes enable row level security;

create policy integra_contador_contribuintes_all on public.integra_contador_contribuintes
  for all using (public.is_soma_staff()) with check (public.is_soma_staff());

-- ---------------------------------------------------------------------------
-- integra_contador_cache: respostas já obtidas da Serpro, com TTL aplicado
-- na leitura (ver integra-contador/cache.py) — cada requisição de produção
-- tem custo real, então isso evita repetir chamada dentro do período em
-- que o dado ainda é considerado válido.
-- ---------------------------------------------------------------------------

create table public.integra_contador_cache (
  id uuid primary key default gen_random_uuid(),
  id_sistema text not null,
  id_servico text not null,
  contribuinte_cnpj text not null,
  dados_hash text not null,
  resposta jsonb not null,
  status integer not null,
  fetched_at timestamptz not null default now()
);

create unique index integra_contador_cache_chave_idx on public.integra_contador_cache (
  id_sistema, id_servico, contribuinte_cnpj, dados_hash
);
create index integra_contador_cache_fetched_at_idx on public.integra_contador_cache (fetched_at);

alter table public.integra_contador_cache enable row level security;

create policy integra_contador_cache_all on public.integra_contador_cache
  for all using (public.is_soma_staff()) with check (public.is_soma_staff());

-- ---------------------------------------------------------------------------
-- integra_contador_requests_log: toda chamada (cache hit ou chamada real),
-- pra dar visibilidade de quanto está sendo gasto de verdade contra a
-- Serpro vs. servido do cache.
-- ---------------------------------------------------------------------------

create table public.integra_contador_requests_log (
  id uuid primary key default gen_random_uuid(),
  "timestamp" timestamptz not null default now(),
  id_sistema text not null,
  id_servico text not null,
  contribuinte_cnpj text not null,
  status_code integer not null,
  from_cache boolean not null,
  duracao_ms integer not null
);

create index integra_contador_requests_log_timestamp_idx on public.integra_contador_requests_log ("timestamp");

alter table public.integra_contador_requests_log enable row level security;

create policy integra_contador_requests_log_select on public.integra_contador_requests_log
  for select using (public.is_soma_staff());
