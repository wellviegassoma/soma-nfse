-- Fase AF — Módulo Financeiro, F6 (parte 1): planejamento orçamentário.
--
-- Fecha o Painel de acompanhamento: sem orçado, ele só mostra o que
-- aconteceu; com orçado, mostra se aconteceu o que devia. É a visão
-- "Realizado x Orçado" que o Nibo tem.

create table public.fin_orcamento (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  categoria_id uuid not null references public.fin_categorias(id) on delete cascade,
  competencia text not null check (competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  -- SEM sinal: o sentido vem da categoria (natureza) na hora de comparar.
  -- Guardar com sinal aqui obrigaria o usuário a digitar "-3000" pro aluguel,
  -- que é como ninguém pensa em orçamento.
  valor numeric(14, 2) not null check (valor >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (categoria_id, competencia)
);
comment on table public.fin_orcamento is
  'Valor orçado por categoria e competência (YYYY-MM). Sempre positivo: o sentido vem da natureza da categoria, pra o usuário digitar 3000 de aluguel e não -3000.';

create index fin_orcamento_company_competencia_idx
  on public.fin_orcamento(company_id, competencia);

create trigger fin_orcamento_set_updated_at before update on public.fin_orcamento
  for each row execute function public.set_updated_at();

alter table public.fin_orcamento enable row level security;

create policy fin_orcamento_all on public.fin_orcamento
  for all using (public.pode_financeiro(company_id))
  with check (public.pode_financeiro(company_id));

-- ---------------------------------------------------------------------------
-- Copiar o orçamento de uma competência pra outra
--
-- Montar orçamento do zero mês a mês é o que faz a funcionalidade ser
-- abandonada. Copiar o mês anterior e ajustar duas linhas é o uso real.
-- ---------------------------------------------------------------------------

create or replace function public.fin_copiar_orcamento(
  p_company_id uuid,
  p_origem text,
  p_destino text
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_copiadas integer;
begin
  insert into public.fin_orcamento (company_id, categoria_id, competencia, valor)
  select o.company_id, o.categoria_id, p_destino, o.valor
  from public.fin_orcamento o
  where o.company_id = p_company_id and o.competencia = p_origem
  -- Não sobrescreve o que o usuário já ajustou no mês de destino.
  on conflict (categoria_id, competencia) do nothing;

  get diagnostics v_copiadas = row_count;
  return v_copiadas;
end;
$$;

comment on function public.fin_copiar_orcamento(uuid, text, text) is
  'Copia o orçamento de uma competência pra outra, sem sobrescrever linhas já ajustadas no destino. Devolve quantas foram criadas.';
