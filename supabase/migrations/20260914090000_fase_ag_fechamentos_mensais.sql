-- Fase AG — Etapa 6 da Rotina de Fechamento ("já pode fechar"): registra
-- que uma competência de uma empresa foi marcada como fechada
-- antecipadamente (Anexo III fixo, sem Fator R — não muda mais com nota
-- lançada depois). Só um registro, NÃO bloqueia edição de
-- notas/faturamento nessa fase — ver plano aprovado (Fase 3).
create table public.fechamentos_mensais (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  competencia text not null, -- "YYYY-MM"
  fechado_em timestamptz not null default now(),
  fechado_por uuid references auth.users(id) on delete set null, -- nulo quando via token interno (chat/curl)
  observacoes text,
  unique (company_id, competencia)
);

create index fechamentos_mensais_competencia_idx on public.fechamentos_mensais (competencia);

alter table public.fechamentos_mensais enable row level security;

create policy fechamentos_mensais_all on public.fechamentos_mensais
  for all using (public.is_soma_staff()) with check (public.is_soma_staff());
