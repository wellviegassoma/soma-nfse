-- Fase CJ: Newton — analista fiscal de IA do Lucro Presumido (Petrópolis e
-- Rio), pedido do Wellington em 24/11/2026. Mesma lógica da Serena: o motor
-- do sistema calcula (PIS/COFINS mensais, IRPJ/CSLL trimestrais, retenções,
-- equiparação hospitalar), a IA só audita a apuração, a transmissão (MIT +
-- DCTFWeb) e as mensagens são sempre com o clique de alguém da equipe.

-- Carteira: Lucro Presumido ativas de Petrópolis/Rio ± exceções.
create table if not exists public.newton_excecoes (
  company_id uuid primary key references public.companies(id) on delete cascade,
  tipo text not null check (tipo in ('INCLUIR', 'EXCLUIR')),
  motivo text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.profiles(id) on delete set null
);

-- Fechamento do mês por empresa: decisão da IA, aprovação humana, MIT/DCTFWeb,
-- DARF salvo no Blob, entrega no eContador, mensagens e pagamento.
create table if not exists public.newton_fechamentos (
  company_id uuid not null references public.companies(id) on delete cascade,
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  ia_decisao text check (ia_decisao in ('APROVAR', 'ESCALAR')),
  ia_justificativa text,
  ia_pergunta text,
  ia_diagnostico text,
  ia_acoes jsonb,
  ia_assinatura text,
  ia_modelo text,
  ia_custo_usd numeric(10, 4),
  ia_em timestamptz,
  escalado_para uuid references public.profiles(id) on delete set null,
  tarefa_id uuid references public.tarefas(id) on delete set null,
  -- Aprovação humana do cálculo (vale para a assinatura aprovada).
  aprovado_assinatura text,
  aprovado_em timestamptz,
  aprovado_por uuid references public.profiles(id) on delete set null,
  -- Depois do MIT encerrado, a DCTFWeb é transmitida (gera o débito).
  dctfweb_transmitida_em timestamptz,
  darf_blob_pathname text,
  darf_valor numeric(14, 2),
  darf_gerado_em timestamptz,
  entregue_em timestamptz,
  entregue_por uuid references public.profiles(id) on delete set null,
  mensagem_guia_em timestamptz,
  mensagem_cobranca_em timestamptz,
  pago boolean,
  pagamento_verificado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  primary key (company_id, competencia)
);
create index if not exists newton_fechamentos_competencia_idx on public.newton_fechamentos(competencia);

alter table public.newton_excecoes enable row level security;
alter table public.newton_fechamentos enable row level security;
drop policy if exists newton_excecoes_all on public.newton_excecoes;
create policy newton_excecoes_all on public.newton_excecoes
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
drop policy if exists newton_fechamentos_all on public.newton_fechamentos;
create policy newton_fechamentos_all on public.newton_fechamentos
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));

-- Chat e propostas: as tabelas da Serena passam a servir aos dois analistas.
alter table public.serena_mensagens add column if not exists analista text not null default 'SERENA'
  check (analista in ('SERENA', 'NEWTON'));
alter table public.serena_propostas add column if not exists analista text not null default 'SERENA'
  check (analista in ('SERENA', 'NEWTON'));
create index if not exists serena_mensagens_analista_idx on public.serena_mensagens(user_id, analista, created_at);
