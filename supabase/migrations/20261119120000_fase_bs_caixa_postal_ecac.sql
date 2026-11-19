-- Fase BS: Central de Intimações — Caixa Postal do e-CAC de toda a carteira
-- (pedido de 19/11/2026, depois de uma intimação vista e não tratada que
-- deixou um cliente inapto).
--
-- Lida pelo Integra Contador com CAIXAPOSTAL.MSGCONTRIBUINTE61 (lista de
-- mensagens): traz assunto, data de envio, relevância, se alguém já leu e
-- a data de ciência — e NÃO dá ciência. O conteúdo da mensagem
-- (MSGDETALHAMENTO62) NÃO é lido: a documentação da Serpro diz que esse
-- serviço "caracteriza ciência da intimação" (art. 23, § 2º, III, do
-- Decreto 70.235/1972), igual a abrir no e-CAC.

create table if not exists public.caixa_postal_mensagens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  isn text not null,                       -- id único da mensagem na Caixa Postal
  numero_controle text,
  assunto text not null,
  relevante boolean not null default false, -- relevancia = 2 ("Com relevância")
  sistema_remetente integer,
  codigo_modelo integer,
  tipo_origem smallint,                     -- 1 Receita, 2 Estado, 3 Município
  descricao_origem text,
  enviada_em timestamptz,
  lida_em timestamptz,                      -- 1ª leitura por qualquer pessoa (e-CAC ou API)
  ciencia_em date,
  validade_em date,
  excluida_em timestamptz,
  dados jsonb not null default '{}'::jsonb, -- item bruto da lista, pra auditoria
  vista_em timestamptz not null default now(),       -- quando o SOMA viu pela 1ª vez
  atualizada_em timestamptz not null default now(),  -- última leitura da lista

  -- Tratamento interno (nunca vem da Receita)
  status text not null default 'nova' check (status in ('nova', 'em_tratamento', 'resolvida')),
  responsavel_id uuid references public.profiles(id) on delete set null,
  observacao text,
  tratamento_em timestamptz,
  tratamento_por uuid references public.profiles(id) on delete set null,

  unique (company_id, isn)
);

create index if not exists caixa_postal_mensagens_abertas_idx
  on public.caixa_postal_mensagens (status, enviada_em desc) where status <> 'resolvida';
create index if not exists caixa_postal_mensagens_company_idx
  on public.caixa_postal_mensagens (company_id, enviada_em desc);

-- Histórico de cada mudança de status/responsável: quem e quando.
create table if not exists public.caixa_postal_tratamentos (
  id uuid primary key default gen_random_uuid(),
  mensagem_id uuid not null references public.caixa_postal_mensagens(id) on delete cascade,
  status text not null check (status in ('nova', 'em_tratamento', 'resolvida')),
  responsavel_id uuid references public.profiles(id) on delete set null,
  observacao text,
  feito_por uuid references public.profiles(id) on delete set null,
  feito_em timestamptz not null default now()
);

create index if not exists caixa_postal_tratamentos_mensagem_idx
  on public.caixa_postal_tratamentos (mensagem_id, feito_em desc);

-- Última leitura da Caixa Postal por empresa — mostra quem está sem leitura
-- (sem procuração 00006 no e-CAC, erro da Serpro), pra não haver ponto cego.
create table if not exists public.caixa_postal_leituras (
  company_id uuid primary key references public.companies(id) on delete cascade,
  lida_em timestamptz not null default now(),
  ok boolean not null,
  erro text,
  quantidade integer not null default 0,
  novas integer not null default 0
);

alter table public.caixa_postal_mensagens enable row level security;
alter table public.caixa_postal_tratamentos enable row level security;
alter table public.caixa_postal_leituras enable row level security;

drop policy if exists caixa_postal_mensagens_all on public.caixa_postal_mensagens;
create policy caixa_postal_mensagens_all on public.caixa_postal_mensagens
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));

drop policy if exists caixa_postal_tratamentos_all on public.caixa_postal_tratamentos;
create policy caixa_postal_tratamentos_all on public.caixa_postal_tratamentos
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));

drop policy if exists caixa_postal_leituras_all on public.caixa_postal_leituras;
create policy caixa_postal_leituras_all on public.caixa_postal_leituras
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
