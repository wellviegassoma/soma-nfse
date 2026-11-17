-- Fase BO: "Verificar pagamento" nas Centrais ISS Rio e Petrópolis
-- (pedido de 17/11/2026). Última verificação da guia de ISS de cada
-- empresa/competência, lida do site da Prefeitura (só leitura):
--  - Rio (Nota Carioca): grade de guias em "Pendentes" e "Quitadas".
--  - Petrópolis: Levantamento de Débitos com parcela "Aberta" e "Paga".
-- A central abre com a última verificação, sem entrar no site de novo.
create table if not exists public.iss_pagamentos (
  company_id uuid not null references public.companies(id) on delete cascade,
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  municipio text not null check (municipio in ('rio', 'petropolis')),
  status text not null check (status in ('paga', 'parcial', 'aberta', 'nao_emitida', 'sem_guia', 'erro')),
  dados jsonb not null default '{}'::jsonb,
  mensagem text,
  verificado_em timestamptz not null default now(),
  verificado_por uuid references public.profiles(id) on delete set null,
  primary key (company_id, competencia, municipio)
);

create index if not exists iss_pagamentos_competencia_idx on public.iss_pagamentos (municipio, competencia);

alter table public.iss_pagamentos enable row level security;

drop policy if exists iss_pagamentos_all on public.iss_pagamentos;
create policy iss_pagamentos_all on public.iss_pagamentos
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
