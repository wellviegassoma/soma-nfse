-- Fase CD: Tarefas — Fase 2 (aprovada em 23/11/2026; desenho em docs/tarefas.md §9).
--
-- Etapas por modelo (checklist e cascata numa coisa só: etapa de outro
-- departamento passa a tarefa para o responsável daquele departamento) e
-- conclusão automática pelas centrais do sistema (fonte escolhida numa lista
-- fixa do código: lib/tarefas-automacao.ts).

create table if not exists public.tarefa_modelo_etapas (
  id uuid primary key default gen_random_uuid(),
  modelo_id uuid not null references public.tarefa_modelos(id) on delete cascade,
  ordem int not null,
  nome text not null,
  -- null = mesmo departamento da etapa anterior (item de checklist)
  departamento_id uuid references public.atendimento_departamentos(id) on delete set null,
  fonte_automatica text,
  depende_do_cliente boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists tarefa_modelo_etapas_modelo_idx on public.tarefa_modelo_etapas(modelo_id, ordem);

create table if not exists public.tarefa_etapas (
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  etapa_id uuid not null references public.tarefa_modelo_etapas(id) on delete cascade,
  concluida_em timestamptz,
  concluida_por uuid references public.profiles(id) on delete set null,
  automatica boolean not null default false,
  primary key (tarefa_id, etapa_id)
);

-- Modelo sem etapas também pode se concluir sozinho por uma fonte.
alter table public.tarefa_modelos add column if not exists fonte_automatica text;

alter table public.tarefas
  -- só faltam etapas que dependem do cliente ⇒ "Aguardando cliente"
  add column if not exists aguardando_cliente boolean not null default false,
  -- ordem da próxima etapa pendente (null = sem etapas ou todas feitas)
  add column if not exists etapa_atual int,
  -- preenchido quando a conclusão veio de uma central (rótulo da fonte)
  add column if not exists concluida_por_fonte text;

alter table public.tarefa_modelo_etapas enable row level security;
alter table public.tarefa_etapas enable row level security;
drop policy if exists tarefa_modelo_etapas_all on public.tarefa_modelo_etapas;
create policy tarefa_modelo_etapas_all on public.tarefa_modelo_etapas
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
drop policy if exists tarefa_etapas_all on public.tarefa_etapas;
create policy tarefa_etapas_all on public.tarefa_etapas
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));

-- Exemplos nos modelos sugeridos (todos ainda desativados) ------------------

insert into public.tarefa_modelo_etapas (modelo_id, ordem, nome, departamento_id, fonte_automatica, depende_do_cliente)
select m.id, v.ordem, v.nome, d.id, v.fonte, v.cliente
from public.tarefa_modelos m
cross join (values
  (1, 'Conferir faturamento', 'Fiscal', 'SIMPLES_APROVADO', false),
  (2, 'Transmitir PGDAS-D', null, 'PGDAS_TRANSMITIDO', false),
  (3, 'Enviar DAS ao cliente', 'Atendimento ao Cliente', null, false),
  (4, 'Cliente pagou o DAS', null, 'DAS_PAGO', true)
) as v(ordem, nome, depto, fonte, cliente)
left join public.atendimento_departamentos d on d.nome = v.depto
where m.nome = 'Apurar Simples (PGDAS-D) e enviar DAS'
  and not exists (select 1 from public.tarefa_modelo_etapas e where e.modelo_id = m.id);

insert into public.tarefa_modelo_etapas (modelo_id, ordem, nome, departamento_id, fonte_automatica, depende_do_cliente)
select m.id, v.ordem, v.nome, null, v.fonte, v.cliente
from public.tarefa_modelos m
cross join (values
  (1, 'Apurar e marcar na Central ISS', 'ISS_MARCADO', false),
  (2, 'Enviar guia ao cliente', null, false),
  (3, 'Cliente pagou o ISS', 'ISS_PAGO', true)
) as v(ordem, nome, fonte, cliente)
where m.nome in ('ISS próprio — Nota Carioca', 'ISS próprio — Petrópolis')
  and not exists (select 1 from public.tarefa_modelo_etapas e where e.modelo_id = m.id);

update public.tarefa_modelos set fonte_automatica = 'REINF_ENVIADA'
  where nome = 'EFD-Reinf' and fonte_automatica is null;
