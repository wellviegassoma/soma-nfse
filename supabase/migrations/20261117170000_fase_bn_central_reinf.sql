-- Fase BN: Central da Reinf (pedido de 17/11/2026).
--
-- Toda nota RECEBIDA (a empresa é tomadora) com retenção federal gera
-- obrigação na EFD-Reinf: IRRF/PIS/COFINS/CSLL de PJ → R-4020, IRRF de
-- pessoa física → R-4010, INSS/CP retido → R-2010. ISS retido fica fora
-- (é municipal). A leitura dos valores é feita do XML (lib/reinf-core.ts).

-- 1) Marca as notas que têm algum indício de retenção no XML, para a
--    Central não precisar baixar o XML de todas as notas recebidas do mês.
--    Indício largo de propósito (inclui vRet* zerado); a conta fina é no
--    código.
alter table public.notas_distribuidas
  add column if not exists tem_retencao boolean
  generated always as (
    coalesce(xml, '') ~ '<(vRetIRRF|vRetCSLL|vRetCP|vTotalRet)>'
    or coalesce(xml, '') ~ '<tpRetISSQN>2</tpRetISSQN>'
    or coalesce(xml, '') ~ '<tpRetPisCofins>1</tpRetPisCofins>'
  ) stored;

create index if not exists notas_distribuidas_retencao_idx
  on public.notas_distribuidas (competencia)
  where direcao = 'entrada' and tem_retencao;

-- 2) Situação da Reinf por empresa e mês (a equipe marca).
create table if not exists public.reinf_fechamentos (
  company_id uuid not null references public.companies(id) on delete cascade,
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  status text not null check (status in ('pendente', 'enviado', 'dispensado')),
  observacao text,
  marcado_em timestamptz not null default now(),
  marcado_por uuid references public.profiles(id) on delete set null,
  primary key (company_id, competencia)
);

create index if not exists reinf_fechamentos_competencia_idx on public.reinf_fechamentos (competencia);

alter table public.reinf_fechamentos enable row level security;

drop policy if exists reinf_fechamentos_all on public.reinf_fechamentos;
create policy reinf_fechamentos_all on public.reinf_fechamentos
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));

-- 3) Ajustes da equipe por nota: natureza do rendimento (quando a
--    sugerida pelo código de serviço não serve), mês do pagamento (o
--    R-4010/R-4020 é pelo pagamento; sem ajuste vale a competência da
--    nota) e "ignorar" (retenção informada por engano na nota).
create table if not exists public.reinf_notas_ajustes (
  nota_id uuid primary key references public.notas_distribuidas(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  natureza text check (natureza ~ '^\d{5}$'),
  mes_pagamento text check (mes_pagamento ~ '^\d{4}-\d{2}$'),
  ignorar boolean not null default false,
  observacao text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.profiles(id) on delete set null
);

create index if not exists reinf_notas_ajustes_mes_idx on public.reinf_notas_ajustes (mes_pagamento);

alter table public.reinf_notas_ajustes enable row level security;

drop policy if exists reinf_notas_ajustes_all on public.reinf_notas_ajustes;
create policy reinf_notas_ajustes_all on public.reinf_notas_ajustes
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
