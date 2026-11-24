-- Fase CG: Serena — carteira de IA do Simples Nacional (pedido de 24/11/2026;
-- desenho em docs/simples-operacao-automatica.md §4–6).
--
-- Carteira = empresas ativas do Simples em Petrópolis e no Rio de Janeiro,
-- mais as incluídas e menos as excluídas aqui. O estado da esteira (notas,
-- prefeitura, cálculo, conferência, PGDAS, pagamento) é lido das tabelas que
-- já existem; aqui fica só o que é da Serena: decisão da IA, DAS salvo,
-- entrega no eContador e mensagens no Digisac.

create table if not exists public.serena_excecoes (
  company_id uuid primary key references public.companies(id) on delete cascade,
  tipo text not null check (tipo in ('INCLUIR', 'EXCLUIR')),
  motivo text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.profiles(id) on delete set null
);

create table if not exists public.serena_fechamentos (
  company_id uuid not null references public.companies(id) on delete cascade,
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  -- Revisor IA (só para conferência "Revisar"; bloqueio nunca é aprovado pela IA)
  ia_decisao text check (ia_decisao in ('APROVAR', 'ESCALAR')),
  ia_justificativa text,
  ia_pergunta text,
  ia_diagnostico text,         -- o problema e a causa provável (texto para a equipe)
  ia_acoes jsonb,              -- [{acao, onde}] correções sugeridas com a tela
  ia_assinatura text,          -- assinatura do cálculo revisado (mudou ⇒ revisar de novo)
  ia_modelo text,
  ia_custo_usd numeric(10, 4),
  ia_em timestamptz,
  escalado_para uuid references public.profiles(id) on delete set null,
  tarefa_id uuid references public.tarefas(id) on delete set null,
  -- DAS gerado uma vez (GERARDAS12 é cobrado) e guardado no Blob privado
  das_blob_pathname text,
  das_gerado_em timestamptz,
  -- Entrega e mensagens
  entregue_em timestamptz,
  entregue_por uuid references public.profiles(id) on delete set null,
  mensagem_guia_em timestamptz,
  mensagem_cobranca_em timestamptz,
  atualizado_em timestamptz not null default now(),
  primary key (company_id, competencia)
);
create index if not exists serena_fechamentos_competencia_idx on public.serena_fechamentos(competencia);

alter table public.serena_excecoes enable row level security;
alter table public.serena_fechamentos enable row level security;
drop policy if exists serena_excecoes_all on public.serena_excecoes;
create policy serena_excecoes_all on public.serena_excecoes
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
drop policy if exists serena_fechamentos_all on public.serena_fechamentos;
create policy serena_fechamentos_all on public.serena_fechamentos
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));

-- Configuração da Serena (ex.: quem recebe os casos que a IA não aprova).
create table if not exists public.serena_config (
  chave text primary key,
  valor jsonb not null,
  atualizado_em timestamptz not null default now()
);
alter table public.serena_config enable row level security;
drop policy if exists serena_config_all on public.serena_config;
create policy serena_config_all on public.serena_config
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
