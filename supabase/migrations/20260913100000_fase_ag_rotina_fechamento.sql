-- Fase AG — Rotina de Fechamento (aba "Automação"): fundação genérica pra
-- registrar cada rodada de cada etapa (Buscar notas, ISS RJ, ISS
-- Petrópolis, fechamento antecipado do Simples, etc.), disparada por um
-- staff logado OU por uma chamada interna autorizada por CRON_SECRET (ver
-- lib/internal-auth.ts) — não é um cron agendado, é uma rotina disparada
-- sob demanda (pelo painel ou por comando externo).
--
-- `rotina_fechamento_execucoes` = 1 linha por rodada de 1 etapa.
-- `rotina_fechamento_itens` = 1 linha por empresa processada naquela
-- rodada — é o que alimenta a tela de conferência (ex.: divergência entre
-- a guia de ISS e o faturamento do sistema).

create table public.rotina_fechamento_execucoes (
  id uuid primary key default gen_random_uuid(),
  etapa text not null, -- "buscar_notas" | "iss_rj" | "iss_petropolis_conferir" | "iss_petropolis_emitir" | "fechar_antecipado" etc.
  competencia text not null, -- "YYYY-MM"
  status text not null default 'RODANDO', -- RODANDO | CONCLUIDO | FALHOU
  total_empresas integer not null default 0,
  sucessos integer not null default 0,
  falhas integer not null default 0,
  executado_por uuid references auth.users(id) on delete set null, -- nulo quando disparado via token interno (chat/curl), preenchido quando um staff clicou no painel
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz
);

create index rotina_fechamento_execucoes_etapa_competencia_idx
  on public.rotina_fechamento_execucoes (etapa, competencia, iniciado_em desc);

create table public.rotina_fechamento_itens (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid not null references public.rotina_fechamento_execucoes(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  status text not null, -- OK | DIVERGENCIA | ERRO
  detalhes jsonb not null default '{}'::jsonb, -- ex.: {valorGuia, faturamentoSoma, diferenca} pras etapas de conferência; {erro} pras que falharam
  created_at timestamptz not null default now()
);

create index rotina_fechamento_itens_execucao_idx
  on public.rotina_fechamento_itens (execucao_id);
create index rotina_fechamento_itens_company_idx
  on public.rotina_fechamento_itens (company_id);

alter table public.rotina_fechamento_execucoes enable row level security;
alter table public.rotina_fechamento_itens enable row level security;

create policy rotina_fechamento_execucoes_all on public.rotina_fechamento_execucoes
  for all using (public.is_soma_staff()) with check (public.is_soma_staff());
create policy rotina_fechamento_itens_all on public.rotina_fechamento_itens
  for all using (public.is_soma_staff()) with check (public.is_soma_staff());
