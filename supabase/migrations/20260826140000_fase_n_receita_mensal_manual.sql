-- companies.rbt12_manual/rbt12_manual_competencia (um único valor total +
-- uma competência de referência) tinha um defeito estrutural: o RBT12 é
-- uma janela móvel de 12 meses, mas um valor agregado não sabe QUAL mês
-- especificamente sai da janela quando o tempo passa — usuário identificou
-- isso ao ver que, mês após mês, o mesmo valor cheio continuava sendo
-- usado sem "descontar" o mês antigo nem "somar" o mês novo do jeito certo.
--
-- Corrigido trazendo o faturamento histórico mês a mês, informado
-- manualmente só pras competências anteriores à empresa existir no
-- sistema (mesmo padrão já usado em folha_mensal pra folha de pagamento,
-- que não tem fonte automática nenhuma). Com o dado por mês, a janela de
-- 12 meses rola sozinha por construção: soma os últimos 12 meses,
-- pegando o real quando existe nota emitida naquele mês, e o manual
-- quando não existe — sem decaimento, sem transição especial, sem
-- "competência de referência" nenhuma.
--
-- companies.rbt12_manual/rbt12_manual_competencia ficam sem uso a partir
-- daqui (não são lidos mais pelo cálculo), mas as colunas não são
-- removidas — mesmo precedente de fator_r_percentual.

create table public.receita_mensal_manual (
  company_id uuid not null references public.companies(id) on delete cascade,
  competencia text not null,
  valor numeric(14, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, competencia)
);
comment on table public.receita_mensal_manual is
  'Faturamento mensal informado manualmente pra competências anteriores à empresa existir no sistema (sem nota emitida/distribuída aqui) — usado no cálculo do RBT12 (Simples Nacional) junto com o faturamento real das notas. competencia no formato YYYY-MM.';

alter table public.receita_mensal_manual enable row level security;

-- Mesmo padrão de folha_mensal: dado de apuração fiscal, exclusivo da
-- equipe SOMA.
create policy receita_mensal_manual_select on public.receita_mensal_manual
  for select using (public.is_soma_staff());
create policy receita_mensal_manual_insert on public.receita_mensal_manual
  for insert with check (public.is_soma_staff());
create policy receita_mensal_manual_update on public.receita_mensal_manual
  for update using (public.is_soma_staff()) with check (public.is_soma_staff());
create policy receita_mensal_manual_delete on public.receita_mensal_manual
  for delete using (public.is_soma_staff());

create trigger receita_mensal_manual_set_updated_at before update on public.receita_mensal_manual
  for each row execute function public.set_updated_at();
