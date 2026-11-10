-- Conferência salva das Centrais ISS Rio e ISS Petrópolis (pedido de
-- 10/11/2026): roda uma vez por empresa/competência e fica guardada — com
-- situação, números do outro lado e quem/quando conferiu — em vez de
-- sumir ao recarregar a tela. Só a última conferência por empresa/mês.
--
-- assinatura_soma é o "retrato" do faturamento da SOMA usado na conferência
-- (quantidade de notas, total, retido, ISS calculado). Se ao abrir a
-- central o retrato atual for outro (buscou nota nova, cancelou, mudou o
-- cadastro do ISS), a linha aparece como desatualizada e precisa ser
-- reprocessada antes de emitir.
create table public.iss_conferencias (
  company_id uuid not null references public.companies(id) on delete cascade,
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  municipio text not null check (municipio in ('rio', 'petropolis')),
  status text not null,
  mensagem text,
  dados jsonb not null default '{}'::jsonb,
  assinatura_soma text not null,
  faturamento_soma numeric(14, 2),
  iss_soma numeric(14, 2),
  conferido_em timestamptz not null default now(),
  conferido_por uuid references public.profiles(id) on delete set null,
  primary key (company_id, competencia)
);

create index iss_conferencias_competencia_idx on public.iss_conferencias (competencia, municipio);

alter table public.iss_conferencias enable row level security;

create policy iss_conferencias_all on public.iss_conferencias
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
