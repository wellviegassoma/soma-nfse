-- O Fator R (folha ÷ RBT12) até aqui era um percentual fixo informado uma
-- única vez por empresa (ver Fase N) — não acompanhava a janela móvel de
-- 12 meses como o RBT12 já faz. Passa a ter controle mensal de verdade:
-- a folha de pagamento não tem fonte automática no sistema (diferente da
-- receita, que vem das notas), então é sempre informada mês a mês pelo
-- contador; o Fator R de cada competência passa a ser a soma dos 12
-- meses de folha informados dividida pelo RBT12 da mesma janela — sem
-- decaimento de valor manual (não existe "dado automático" de folha pra
-- fazer transição, é sempre o que foi preenchido na mão).
--
-- companies.fator_r_percentual fica sem uso a partir daqui (não é lido
-- mais pelo cálculo), mas a coluna não é removida — evita quebrar nada
-- que ainda dependa dela e não custa nada manter.

create table public.folha_mensal (
  company_id uuid not null references public.companies(id) on delete cascade,
  competencia text not null,
  valor numeric(14, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, competencia)
);
comment on table public.folha_mensal is
  'Folha de pagamento mensal informada manualmente por empresa — usada pra calcular o Fator R (÷ RBT12) do Simples Nacional. competencia no formato YYYY-MM.';

alter table public.folha_mensal enable row level security;

-- Mesmo padrão de notas_distribuidas/fechamento: dado de apuração
-- fiscal, exclusivo da equipe SOMA.
create policy folha_mensal_select on public.folha_mensal
  for select using (public.is_soma_staff());
create policy folha_mensal_insert on public.folha_mensal
  for insert with check (public.is_soma_staff());
create policy folha_mensal_update on public.folha_mensal
  for update using (public.is_soma_staff()) with check (public.is_soma_staff());
create policy folha_mensal_delete on public.folha_mensal
  for delete using (public.is_soma_staff());

create trigger folha_mensal_set_updated_at before update on public.folha_mensal
  for each row execute function public.set_updated_at();
