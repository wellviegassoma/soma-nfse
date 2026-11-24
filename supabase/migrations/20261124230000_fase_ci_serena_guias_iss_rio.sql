-- Fase CI: Serena — guias de ISS pendentes na Nota Carioca (Rio), pedido de
-- 24/11/2026. Empresa do Simples no Rio pode ter guia de ISS fora do DAS —
-- em geral 1287 "Retenção dos Optantes" (ISS retido como TOMADORA de
-- prestadores do Simples). A Serena lê a grade de guias (robô já existente,
-- só leitura), alerta, e emite a guia com o clique de alguém; o PDF entra no
-- ZIP do eContador junto com o DAS.

create table if not exists public.serena_guias_iss (
  company_id uuid not null references public.companies(id) on delete cascade,
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  valor numeric(14, 2),
  origem text,
  receitas jsonb,                 -- [{codigo, descricao, base, principal}] quando lidas
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'EMITIDA', 'PAGA')),
  consultado_em timestamptz not null default now(),
  pdf_blob_pathname text,
  emitida_em timestamptz,
  emitida_por uuid references public.profiles(id) on delete set null,
  entregue_em timestamptz,
  primary key (company_id, competencia)
);

-- Última leitura por empresa (inclusive erro, ex.: certificado vencido).
create table if not exists public.serena_guias_iss_consultas (
  company_id uuid primary key references public.companies(id) on delete cascade,
  consultado_em timestamptz not null default now(),
  pendentes int not null default 0,
  erro text
);

alter table public.serena_guias_iss enable row level security;
alter table public.serena_guias_iss_consultas enable row level security;
drop policy if exists serena_guias_iss_all on public.serena_guias_iss;
create policy serena_guias_iss_all on public.serena_guias_iss
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
drop policy if exists serena_guias_iss_consultas_all on public.serena_guias_iss_consultas;
create policy serena_guias_iss_consultas_all on public.serena_guias_iss_consultas
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
