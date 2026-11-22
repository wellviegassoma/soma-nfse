-- Fase CB: metas SOMA na Agenda Tributária (pedido de 22/11/2026).
--
-- Para cada obrigação da agenda da Receita, a SOMA pode cadastrar o dia do
-- mês em que quer entregar ao cliente (ex.: Simples vence dia 23 → meta dia
-- 15). No calendário da Visão geral a obrigação aparece duas vezes: na meta
-- (roxo) e no prazo final da Receita. Sem meta, só o prazo final.
--
-- A meta é da obrigação, não do mês: `chave` identifica a obrigação em
-- qualquer mês importado (ver chaveObrigacao em lib/agenda-tributaria.ts:
-- "TRIBUTO:<código>" ou, sem código, "<tipo>:<descrição normalizada>").
create table if not exists public.agenda_tributaria_metas (
  chave text primary key,
  tipo text not null check (tipo in ('TRIBUTO', 'DECLARACAO')),
  codigo text,
  grupo text,
  descricao text not null,       -- descrição de referência (a mais recente)
  dia_meta int not null check (dia_meta between 1 and 31),
  observacao text,               -- ex.: "enviar guia ao cliente"
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null
);

alter table public.agenda_tributaria_metas enable row level security;

drop policy if exists agenda_tributaria_metas_all on public.agenda_tributaria_metas;
create policy agenda_tributaria_metas_all on public.agenda_tributaria_metas
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
