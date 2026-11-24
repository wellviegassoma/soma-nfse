-- Fase CK: Newton — equiparação hospitalar nota a nota (pedido do Wellington,
-- 24/11/2026). O Newton classifica cada nota (entra / não entra / dúvida) pela
-- regra (lib/equiparacao.ts) e APRENDE com quem decide: a decisão sobre uma
-- descrição de nota vale para as próximas notas iguais daquela empresa.

-- Decisões aprendidas: por empresa e "chave" da descrição (sem números, datas
-- e pontuação). Última decisão vale.
create table if not exists public.newton_equiparacao_decisoes (
  company_id uuid not null references public.companies(id) on delete cascade,
  chave text not null,
  hospitalar boolean not null,
  exemplo text,
  decidido_por uuid references public.profiles(id) on delete set null,
  decidido_em timestamptz not null default now(),
  primary key (company_id, chave)
);

-- Configuração por empresa: o que fazer com a dúvida (null = perguntar) e a
-- natureza jurídica (a equiparação exige sociedade empresária — 2240/2232 são
-- sociedade simples e não podem usar).
create table if not exists public.newton_equiparacao_empresa (
  company_id uuid primary key references public.companies(id) on delete cascade,
  duvida_padrao boolean,
  natureza_juridica text,
  atualizado_em timestamptz not null default now()
);

alter table public.newton_equiparacao_decisoes enable row level security;
alter table public.newton_equiparacao_empresa enable row level security;
drop policy if exists newton_equiparacao_decisoes_all on public.newton_equiparacao_decisoes;
create policy newton_equiparacao_decisoes_all on public.newton_equiparacao_decisoes
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
drop policy if exists newton_equiparacao_empresa_all on public.newton_equiparacao_empresa;
create policy newton_equiparacao_empresa_all on public.newton_equiparacao_empresa
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
