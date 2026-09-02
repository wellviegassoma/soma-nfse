-- Fase W — Integra Contador (PGDAS-D): histórico auditável de declarações
-- do Simples Nacional transmitidas de verdade pelo sistema. Mesmo espírito
-- de `integra_contador_mit_encerramentos` (20260901220000) — o serviço em
-- integra-contador/ não escreve aqui (não conhece `companies`), quem
-- escreve é o frontend logo após um POST bem-sucedido em
-- .../simples/declarar com indicadorTransmissao=true (nunca em simulação).

create table public.integra_contador_pgdas_declaracoes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  competencia text not null, -- "YYYY-MM"
  id_declaracao text,
  data_hora_transmissao text, -- valor bruto devolvido pela Serpro, sem parsing
  valor_total numeric(14, 2), -- soma de valoresDevidos.valor, conforme confirmado pela Serpro
  dados_enviados jsonb not null, -- payload exato transmitido — auditoria de exatamente o que foi declarado em nome do cliente
  transmitted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index integra_contador_pgdas_declaracoes_company_competencia_idx
  on public.integra_contador_pgdas_declaracoes (company_id, competencia);

create trigger integra_contador_pgdas_declaracoes_set_updated_at
  before update on public.integra_contador_pgdas_declaracoes
  for each row execute function public.set_updated_at();

alter table public.integra_contador_pgdas_declaracoes enable row level security;

create policy integra_contador_pgdas_declaracoes_all on public.integra_contador_pgdas_declaracoes
  for all using (public.is_soma_staff()) with check (public.is_soma_staff());
