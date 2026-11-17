-- Fase BP: "DAS pago?" na Central Simples (pedido de 17/11/2026).
-- Última verificação do pagamento do DAS de cada empresa/competência,
-- lida do Integra Contador (PAGTOWEB.PAGAMENTOS71 — consulta cobrada; a
-- central abre com a última verificação, sem consultar de novo).
create table if not exists public.das_pagamentos (
  company_id uuid not null references public.companies(id) on delete cascade,
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  status text not null check (status in ('pago', 'nao_pago', 'erro')),
  dados jsonb not null default '{}'::jsonb,
  verificado_em timestamptz not null default now(),
  verificado_por uuid references public.profiles(id) on delete set null,
  primary key (company_id, competencia)
);

create index if not exists das_pagamentos_competencia_idx on public.das_pagamentos (competencia);

alter table public.das_pagamentos enable row level security;

drop policy if exists das_pagamentos_all on public.das_pagamentos;
create policy das_pagamentos_all on public.das_pagamentos
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
