-- Conferência do faturamento do Simples Nacional contra o site da Prefeitura
-- (hoje só Petrópolis — o Nota Carioca não traz as notas do Emissor Nacional
-- de empresas do Simples, ver conversa de 07/10/2026). Guarda a última
-- consulta por empresa/competência pra a Central Simples Nacional mostrar a
-- coluna "Prefeitura" sem precisar logar no site a cada abertura de tela.
create table public.conferencia_prefeitura (
  company_id uuid not null references public.companies(id) on delete cascade,
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  valor_prefeitura numeric(14, 2),
  valor_notas numeric(14, 2),
  erro text,
  consultado_em timestamptz not null default now(),
  consultado_por uuid references public.profiles(id) on delete set null,
  primary key (company_id, competencia)
);

alter table public.conferencia_prefeitura enable row level security;

create policy conferencia_prefeitura_all on public.conferencia_prefeitura
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
