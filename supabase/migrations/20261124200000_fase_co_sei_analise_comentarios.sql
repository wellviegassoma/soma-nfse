-- Fase CO — SEI: registro de análise e comentários internos por processo.
-- "Analisado até aqui": quem olhou, até qual andamento, e com quem está a bola
-- (Prefeitura / cliente / SOMA). Processo "a analisar" = nunca analisado ou com
-- andamento relevante depois da última análise. Spec: docs/sei.md.

create table if not exists public.sei_analises (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.sei_processos(id) on delete cascade,
  analisado_ate timestamptz,                   -- data/hora do andamento até onde se olhou
  bola text not null check (bola in ('PREFEITURA', 'CLIENTE', 'SOMA')),
  comentario text,
  criado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists sei_analises_processo_idx on public.sei_analises (processo_id, created_at desc);

create table if not exists public.sei_comentarios (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.sei_processos(id) on delete cascade,
  texto text not null,
  criado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists sei_comentarios_processo_idx on public.sei_comentarios (processo_id, created_at desc);

-- Resumo da última análise no próprio processo (lista e filtros).
alter table public.sei_processos
  add column if not exists ultima_analise_em timestamptz,
  add column if not exists ultima_analise_ate timestamptz,
  add column if not exists ultima_analise_por uuid references public.profiles(id) on delete set null,
  add column if not exists bola text check (bola is null or bola in ('PREFEITURA', 'CLIENTE', 'SOMA')),
  add column if not exists bola_desde timestamptz;

do $$
declare t text;
begin
  foreach t in array array['sei_analises', 'sei_comentarios'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select using ((select public.tem_permissao(''legalizacao.ver'')))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all using ((select public.tem_permissao(''legalizacao.editar''))) with check ((select public.tem_permissao(''legalizacao.editar'')))', t || '_write', t);
  end loop;
end $$;
