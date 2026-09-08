-- Fase AF (parte 2) — rastro da origem no Nibo.
--
-- É o que torna a migração IDEMPOTENTE: rodar duas vezes não duplica, porque
-- o segundo passe reconhece pelo nibo_id o que já veio. Sem isso, uma queda no
-- meio da importação deixaria a empresa com metade dos registros dobrada — e
-- limpar isso depois, com o cliente já usando, é bem pior do que a coluna.
--
-- Fica NULL pra tudo que nasceu aqui dentro. Único POR EMPRESA, não global:
-- ids do Nibo só são únicos dentro de uma conta do Nibo.

alter table public.fin_categorias add column nibo_id text;
alter table public.fin_centros_custo add column nibo_id text;
alter table public.fin_contatos add column nibo_id text;
alter table public.fin_agendamentos add column nibo_id text;
alter table public.extrato_contas_bancarias add column nibo_id text;

create unique index fin_categorias_nibo_id_idx
  on public.fin_categorias(company_id, nibo_id) where nibo_id is not null;
create unique index fin_centros_custo_nibo_id_idx
  on public.fin_centros_custo(company_id, nibo_id) where nibo_id is not null;
create unique index fin_contatos_nibo_id_idx
  on public.fin_contatos(company_id, nibo_id) where nibo_id is not null;
create unique index fin_agendamentos_nibo_id_idx
  on public.fin_agendamentos(company_id, nibo_id) where nibo_id is not null;
create unique index extrato_contas_bancarias_nibo_id_idx
  on public.extrato_contas_bancarias(company_id, nibo_id) where nibo_id is not null;

comment on column public.fin_agendamentos.nibo_id is
  'scheduleId de origem no Nibo, quando o registro veio da migração. NULL pro que nasceu aqui.';
