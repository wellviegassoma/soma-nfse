-- Fase CF: Tarefas — avulsas, anexos e "nova para você" (pedido de 24/11/2026).
--
-- 1) Tarefa avulsa: demanda pontual de uma empresa (intimação, alteração,
--    pedido do cliente) sem modelo. Tem título próprio; modelo_id fica nulo.
-- 2) Anexos da tarefa (Vercel Blob privado, download por proxy — mesmo padrão
--    da Legalização).
-- 3) atribuida_em: quando a tarefa chegou ao responsável atual (cascata,
--    carteira, "Passar para…") — base do aviso "nova para você".

alter table public.tarefas alter column modelo_id drop not null;
alter table public.tarefas
  add column if not exists titulo text,
  add column if not exists descricao text,
  add column if not exists criada_por uuid references public.profiles(id) on delete set null,
  add column if not exists atribuida_em timestamptz;

alter table public.tarefas drop constraint if exists tarefas_modelo_ou_titulo_ck;
alter table public.tarefas add constraint tarefas_modelo_ou_titulo_ck
  check (modelo_id is not null or (titulo is not null and length(trim(titulo)) > 0));

update public.tarefas set atribuida_em = coalesce(atribuida_em, created_at) where responsavel_id is not null;

create or replace function public.tarefas_marcar_atribuicao()
returns trigger
language plpgsql
as $$
begin
  if new.responsavel_id is not null
     and (tg_op = 'INSERT' or new.responsavel_id is distinct from old.responsavel_id) then
    new.atribuida_em := now();
  end if;
  return new;
end;
$$;

drop trigger if exists tarefas_marcar_atribuicao on public.tarefas;
create trigger tarefas_marcar_atribuicao before insert or update of responsavel_id on public.tarefas
  for each row execute function public.tarefas_marcar_atribuicao();

create table if not exists public.tarefa_anexos (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  nome_arquivo text not null,
  blob_url text not null,
  blob_pathname text not null,
  enviado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists tarefa_anexos_tarefa_idx on public.tarefa_anexos(tarefa_id);

alter table public.tarefa_anexos enable row level security;
drop policy if exists tarefa_anexos_all on public.tarefa_anexos;
create policy tarefa_anexos_all on public.tarefa_anexos
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
