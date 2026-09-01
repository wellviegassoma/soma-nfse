-- "Baixar tudo (ZIP)" do Fechamento gerava tudo (XML + PDF de cada nota +
-- relatório por empresa) numa chamada HTTP só — com 3.603 notas só em
-- agosto/2026, isso estoura o tempo limite da função serverless (504
-- Gateway Timeout). Passa a rodar em lotes por empresa a partir do
-- navegador (mesmo padrão já usado pra sincronização), guardando o
-- progresso aqui e o ZIP de cada empresa no Vercel Blob até juntar tudo
-- no ZIP final.
create table public.exportacoes_fechamento (
  id uuid primary key default gen_random_uuid(),
  competencia text not null,
  status text not null default 'processando' check (status in ('processando', 'pronto', 'erro')),
  progresso_atual int not null default 0,
  progresso_total int not null default 0,
  blob_pathname text,
  erro text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index exportacoes_fechamento_competencia_idx on public.exportacoes_fechamento(competencia);

create trigger exportacoes_fechamento_set_updated_at before update on public.exportacoes_fechamento
  for each row execute function public.set_updated_at();

alter table public.exportacoes_fechamento enable row level security;

create policy exportacoes_fechamento_all on public.exportacoes_fechamento
  for all using (public.is_soma_staff()) with check (public.is_soma_staff());
