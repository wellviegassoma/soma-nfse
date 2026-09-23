-- Fase AM — Redesenho de permissões: fundação. Substitui o modelo de
-- "1 role fixa por empresa" (user_companies.role, 8 valores) por permissões
-- individuais, granulares, por pessoa: uma linha por capacidade concedida,
-- com escopo GLOBAL (equipe interna SOMA) ou por EMPRESA (usuário de
-- cliente). Ver plano completo no histórico do chat — resumo:
--
-- - permissoes_catalogo: as chaves válidas (ex. 'integra_contador.declarar'),
--   o módulo dono, o escopo permitido e se é uma ação irreversível.
-- - usuario_permissoes: quem tem o quê — 1 linha por (usuário, empresa
--   opcional, permissão). company_id null = concessão global.
-- - user_companies NÃO é apagada nesta fase — vira só uma fonte de backfill
--   e ganha um trigger espelho temporário (mantém as duas fontes
--   consistentes enquanto a tela antiga de convite ainda existe). As
--   policies de escrita dela são congeladas na próxima migration.

-- ---------------------------------------------------------------------------
-- Catálogo de permissões
-- ---------------------------------------------------------------------------
create table public.permissoes_catalogo (
  chave text primary key,
  modulo text not null,
  escopo text not null check (escopo in ('GLOBAL', 'EMPRESA', 'AMBOS')),
  irreversivel boolean not null default false,
  ordem int not null default 0
);
comment on table public.permissoes_catalogo is
  'Permissões válidas do sistema — rótulo/descrição ficam em frontend/src/lib/permissoes/catalogo.ts; aqui só o necessário pra integridade (FK) e pra RLS/RPC decidirem escopo.';

insert into public.permissoes_catalogo (chave, modulo, escopo, irreversivel, ordem) values
  -- Usuários
  ('usuarios.gerenciar_equipe', 'usuarios', 'GLOBAL', false, 10),
  ('usuarios.gerenciar_clientes', 'usuarios', 'GLOBAL', false, 11),
  ('usuarios_empresa.gerenciar', 'usuarios', 'EMPRESA', false, 12),
  -- Configurações
  ('configuracoes.editar', 'configuracoes', 'GLOBAL', false, 20),
  -- Empresas (base do Painel SOMA)
  ('empresas.ver', 'empresas', 'GLOBAL', false, 30),
  ('empresas.editar', 'empresas', 'GLOBAL', false, 31),
  -- Certificados
  ('certificados.ver', 'certificados', 'GLOBAL', false, 40),
  ('certificados.gerenciar', 'certificados', 'GLOBAL', false, 41),
  -- Cofre de senhas
  ('cofre_senhas.ver', 'cofre_senhas', 'GLOBAL', false, 50),
  ('cofre_senhas.revelar', 'cofre_senhas', 'GLOBAL', false, 51),
  ('cofre_senhas.editar', 'cofre_senhas', 'GLOBAL', false, 52),
  -- Integra Contador
  ('integra_contador.consultar', 'integra_contador', 'GLOBAL', false, 60),
  ('integra_contador.emitir_guias', 'integra_contador', 'GLOBAL', false, 61),
  ('integra_contador.declarar', 'integra_contador', 'GLOBAL', true, 62),
  -- Impostos
  ('impostos.ver', 'impostos', 'GLOBAL', false, 70),
  ('impostos.editar', 'impostos', 'GLOBAL', false, 71),
  ('impostos.emitir_iss', 'impostos', 'GLOBAL', true, 72),
  -- Fechamento / Automação
  ('fechamento.ver', 'fechamento', 'GLOBAL', false, 80),
  ('fechamento.executar', 'fechamento', 'GLOBAL', false, 81),
  -- Precificação
  ('precificacao.ver', 'precificacao', 'AMBOS', false, 90),
  ('precificacao.editar', 'precificacao', 'AMBOS', false, 91),
  ('precificacao.modelos', 'precificacao', 'GLOBAL', false, 92),
  -- Logs / Erros
  ('auditoria.ver', 'auditoria', 'GLOBAL', false, 100),
  -- Chat IA
  ('chat_ia.usar', 'chat_ia', 'GLOBAL', false, 110),
  -- Legalização
  ('legalizacao.ver', 'legalizacao', 'GLOBAL', false, 120),
  ('legalizacao.editar', 'legalizacao', 'GLOBAL', false, 121),
  -- Extratos
  ('extratos.ver', 'extratos', 'GLOBAL', false, 130),
  ('extratos.editar', 'extratos', 'GLOBAL', false, 131),
  -- Atendimento
  ('atendimento.atender', 'atendimento', 'GLOBAL', false, 140),
  -- Financeiro
  ('financeiro.ver', 'financeiro', 'AMBOS', false, 150),
  ('financeiro.editar', 'financeiro', 'AMBOS', false, 151),
  -- Portal do cliente
  ('portal.ver', 'portal', 'EMPRESA', false, 160),
  ('notas.emitir', 'portal', 'EMPRESA', false, 161),
  ('notas.cancelar', 'portal', 'EMPRESA', true, 162),
  ('tomadores.editar', 'portal', 'EMPRESA', false, 163);

-- ---------------------------------------------------------------------------
-- Concessões
-- ---------------------------------------------------------------------------
create table public.usuario_permissoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade, -- null = global
  permissao text not null references public.permissoes_catalogo(chave) on update cascade,
  concedido_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.usuario_permissoes is
  'Concessões individuais — 1 linha por capacidade. company_id null = concessão global (equipe SOMA); preenchido = escopada a uma empresa cliente.';

create unique index usuario_permissoes_global_uniq on public.usuario_permissoes(user_id, permissao) where company_id is null;
create unique index usuario_permissoes_empresa_uniq on public.usuario_permissoes(user_id, company_id, permissao) where company_id is not null;
create index usuario_permissoes_company_idx on public.usuario_permissoes(company_id);
create index usuario_permissoes_user_idx on public.usuario_permissoes(user_id);

-- Valida o escopo da concessão contra o catálogo — não cabe numa CHECK
-- simples porque depende de outra tabela.
create or replace function public.validar_escopo_permissao()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_escopo text;
begin
  select escopo into v_escopo from public.permissoes_catalogo where chave = new.permissao;
  if v_escopo is null then
    raise exception 'Permissão desconhecida: %', new.permissao;
  end if;
  if new.company_id is null and v_escopo = 'EMPRESA' then
    raise exception 'Permissão % exige uma empresa (escopo EMPRESA).', new.permissao;
  end if;
  if new.company_id is not null and v_escopo = 'GLOBAL' then
    raise exception 'Permissão % é global, não pode ser concedida por empresa.', new.permissao;
  end if;
  return new;
end;
$$;

create trigger usuario_permissoes_validar_escopo
  before insert or update on public.usuario_permissoes
  for each row execute function public.validar_escopo_permissao();

-- profiles.ativo: suspender alguém sem apagar o histórico (audit_logs,
-- mensagens de atendimento etc. referenciam profiles.id).
alter table public.profiles add column ativo boolean not null default true;

-- E-mail único (a busca do convite atual usa profiles.email sem garantia
-- nenhuma de unicidade — corrigido aqui antes de qualquer tela nova depender disso).
create unique index profiles_email_lower_uniq on public.profiles (lower(email)) where email is not null;

-- ---------------------------------------------------------------------------
-- Funções de leitura (security definer — evita recursão de RLS)
-- ---------------------------------------------------------------------------
create or replace function public.tem_permissao(p_permissao text, p_company_id uuid default null)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(exists (
    select 1
    from public.usuario_permissoes up
    join public.profiles p on p.id = up.user_id
    where up.user_id = auth.uid()
      and p.ativo
      and up.permissao = p_permissao
      and (up.company_id is null or up.company_id = p_company_id)
  ), false);
$$;
comment on function public.tem_permissao(text, uuid) is
  'Permissão global sempre vale; permissão por empresa só vale se p_company_id bater. Usuário suspenso (profiles.ativo=false) nunca tem nenhuma.';

create or replace function public.tem_acesso_empresa(p_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(exists (
    select 1
    from public.usuario_permissoes up
    join public.profiles p on p.id = up.user_id
    where up.user_id = auth.uid()
      and p.ativo
      and up.company_id = p_company_id
  ), false);
$$;
comment on function public.tem_acesso_empresa(uuid) is
  'Substitui user_company_role(company_id) is not null — "tem QUALQUER permissão escopada a essa empresa".';

-- Formato: uma linha por concessão do usuário logado (permissao, company_id).
-- O app agrupa em { global: Set<permissao>, porEmpresa: Map<companyId, Set<permissao>> }.
create or replace function public.minhas_permissoes()
returns table (permissao text, company_id uuid)
language sql
security definer
set search_path = public
stable
as $$
  select up.permissao, up.company_id
  from public.usuario_permissoes up
  join public.profiles p on p.id = up.user_id
  where up.user_id = auth.uid() and p.ativo;
$$;

-- ---------------------------------------------------------------------------
-- Migração dos 8 papéis existentes — usada no backfill abaixo e no trigger
-- espelho (mantém user_companies e usuario_permissoes consistentes enquanto
-- as duas existirem lado a lado).
-- ---------------------------------------------------------------------------
create or replace function public.permissoes_do_papel_legado(p_role public.user_role)
returns text[]
language sql
immutable
as $$
  select case p_role
    when 'SUPER_ADMIN' then array[
      'usuarios.gerenciar_equipe', 'usuarios.gerenciar_clientes', 'configuracoes.editar',
      'empresas.ver', 'empresas.editar', 'certificados.ver', 'certificados.gerenciar',
      'cofre_senhas.ver', 'cofre_senhas.revelar', 'cofre_senhas.editar',
      'integra_contador.consultar', 'integra_contador.emitir_guias', 'integra_contador.declarar',
      'impostos.ver', 'impostos.editar', 'impostos.emitir_iss',
      'fechamento.ver', 'fechamento.executar',
      'precificacao.ver', 'precificacao.editar', 'precificacao.modelos',
      'auditoria.ver', 'chat_ia.usar',
      'legalizacao.ver', 'legalizacao.editar', 'extratos.ver', 'extratos.editar',
      'atendimento.atender', 'financeiro.ver', 'financeiro.editar'
    ]
    when 'ADMIN_SOMA' then array[
      -- Tudo que SUPER_ADMIN tem, MENOS gerenciar_equipe e configuracoes.editar
      -- (decisão confirmada: só quem gerencia equipe promove gente a papel interno).
      'usuarios.gerenciar_clientes',
      'empresas.ver', 'empresas.editar', 'certificados.ver', 'certificados.gerenciar',
      'cofre_senhas.ver', 'cofre_senhas.revelar', 'cofre_senhas.editar',
      'integra_contador.consultar', 'integra_contador.emitir_guias', 'integra_contador.declarar',
      'impostos.ver', 'impostos.editar', 'impostos.emitir_iss',
      'fechamento.ver', 'fechamento.executar',
      'precificacao.ver', 'precificacao.editar', 'precificacao.modelos',
      'auditoria.ver', 'chat_ia.usar',
      'legalizacao.ver', 'legalizacao.editar', 'extratos.ver', 'extratos.editar',
      'atendimento.atender', 'financeiro.ver', 'financeiro.editar'
    ]
    when 'ANALISTA_LEGALIZACAO' then array[
      'legalizacao.ver', 'legalizacao.editar', 'cofre_senhas.ver', 'cofre_senhas.revelar'
    ]
    when 'ANALISTA_CONTABIL' then array['extratos.ver', 'extratos.editar']
    when 'ANALISTA_FINANCEIRO' then array['financeiro.ver', 'financeiro.editar']
    when 'ANALISTA_ATENDIMENTO' then array['atendimento.atender']
    when 'ADMIN_CLIENTE' then array[
      'portal.ver', 'notas.emitir', 'notas.cancelar', 'tomadores.editar',
      'precificacao.ver', 'precificacao.editar', 'financeiro.ver', 'financeiro.editar',
      'usuarios_empresa.gerenciar'
    ]
    when 'EMISSOR' then array[
      'portal.ver', 'notas.emitir', 'notas.cancelar', 'tomadores.editar',
      'precificacao.ver', 'precificacao.editar'
    ]
    else array[]::text[]
  end;
$$;
comment on function public.permissoes_do_papel_legado(public.user_role) is
  'Mapeamento 1:1 do enum antigo pro conjunto de permissões equivalente — usado só no backfill e no trigger espelho de transição. Papel de equipe (SUPER_ADMIN/ADMIN_SOMA/ANALISTA_*) é sempre GLOBAL aqui, mesmo que a linha em user_companies aponte pra uma empresa (inclusive a da própria SOMA) — é assim que o sistema atual já trata esses papéis.';

-- Papéis "de equipe" viram concessão GLOBAL (company_id null), não importa
-- pra qual empresa a linha de user_companies aponte. ADMIN_CLIENTE/EMISSOR
-- viram concessão NAQUELA empresa.
do $$
declare
  v_role public.user_role;
  v_eh_equipe boolean;
begin
  for v_role in select unnest(enum_range(null::public.user_role)) loop
    v_eh_equipe := v_role in ('SUPER_ADMIN', 'ADMIN_SOMA', 'ANALISTA_LEGALIZACAO', 'ANALISTA_CONTABIL', 'ANALISTA_FINANCEIRO', 'ANALISTA_ATENDIMENTO');
    insert into public.usuario_permissoes (user_id, company_id, permissao)
    select uc.user_id, case when v_eh_equipe then null else uc.company_id end, perm
    from public.user_companies uc
    cross join lateral unnest(public.permissoes_do_papel_legado(uc.role)) as perm
    where uc.role = v_role
    on conflict do nothing;
  end loop;
end $$;

-- Trigger espelho — só existe durante a transição (removido quando a tela
-- antiga de convite/edição por user_companies.role sair de uso). Mantém
-- usuario_permissoes sincronizada se algo ainda escrever em user_companies
-- (ex.: um deploy do app antigo rodando ao mesmo tempo que o banco novo).
create or replace function public.espelhar_user_companies_em_permissoes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eh_equipe boolean;
  v_scope_company_id uuid;
begin
  if tg_op = 'DELETE' then
    v_eh_equipe := old.role in ('SUPER_ADMIN', 'ADMIN_SOMA', 'ANALISTA_LEGALIZACAO', 'ANALISTA_CONTABIL', 'ANALISTA_FINANCEIRO', 'ANALISTA_ATENDIMENTO');
    v_scope_company_id := case when v_eh_equipe then null else old.company_id end;
    delete from public.usuario_permissoes
      where user_id = old.user_id
        and permissao = any(public.permissoes_do_papel_legado(old.role))
        and coalesce(company_id::text, '') = coalesce(v_scope_company_id::text, '');
    return old;
  end if;

  if tg_op = 'UPDATE' and old.role is distinct from new.role then
    v_eh_equipe := old.role in ('SUPER_ADMIN', 'ADMIN_SOMA', 'ANALISTA_LEGALIZACAO', 'ANALISTA_CONTABIL', 'ANALISTA_FINANCEIRO', 'ANALISTA_ATENDIMENTO');
    v_scope_company_id := case when v_eh_equipe then null else old.company_id end;
    delete from public.usuario_permissoes
      where user_id = old.user_id
        and permissao = any(public.permissoes_do_papel_legado(old.role))
        and coalesce(company_id::text, '') = coalesce(v_scope_company_id::text, '');
  end if;

  v_eh_equipe := new.role in ('SUPER_ADMIN', 'ADMIN_SOMA', 'ANALISTA_LEGALIZACAO', 'ANALISTA_CONTABIL', 'ANALISTA_FINANCEIRO', 'ANALISTA_ATENDIMENTO');
  v_scope_company_id := case when v_eh_equipe then null else new.company_id end;
  insert into public.usuario_permissoes (user_id, company_id, permissao)
  select new.user_id, v_scope_company_id, perm
  from unnest(public.permissoes_do_papel_legado(new.role)) as perm
  on conflict do nothing;
  return new;
end;
$$;

create trigger user_companies_espelhar_permissoes
  after insert or update or delete on public.user_companies
  for each row execute function public.espelhar_user_companies_em_permissoes();

-- ---------------------------------------------------------------------------
-- RLS das tabelas novas
-- ---------------------------------------------------------------------------
alter table public.permissoes_catalogo enable row level security;
create policy permissoes_catalogo_select on public.permissoes_catalogo
  for select using (auth.uid() is not null);

alter table public.usuario_permissoes enable row level security;
-- Só leitura direta (o próprio usuário, ou quem já enxerga o perfil dele
-- via shares_company_with/is_soma_staff) — escrita só pela RPC da próxima
-- migration (security definer, roda como owner, ignora RLS de propósito).
create policy usuario_permissoes_select on public.usuario_permissoes
  for select using (
    user_id = auth.uid()
    or public.is_soma_staff()
    or public.shares_company_with(user_id)
  );
