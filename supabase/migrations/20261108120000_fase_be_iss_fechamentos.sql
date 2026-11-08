-- Fechamento do ISS por empresa/competência (pedido de 08/11/2026): marca
-- sozinho quando a guia sai pelo sistema (Nota Carioca ou Prefeitura de
-- Petrópolis) e deixa a equipe marcar à mão as emitidas por fora.
create table public.iss_fechamentos (
  company_id uuid not null references public.companies(id) on delete cascade,
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  origem text not null check (origem in ('sistema', 'manual')),
  valor_guia numeric(14, 2),
  observacao text,
  marcado_em timestamptz not null default now(),
  marcado_por uuid references public.profiles(id) on delete set null,
  primary key (company_id, competencia)
);

create index iss_fechamentos_competencia_idx on public.iss_fechamentos (competencia);

alter table public.iss_fechamentos enable row level security;

create policy iss_fechamentos_all on public.iss_fechamentos
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
