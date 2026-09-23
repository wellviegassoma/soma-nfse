-- REVERTE a migration anterior (20260925140000) — remover `security
-- definer` de tem_permissao()/is_soma_staff()/etc. causou RECURSÃO real:
-- usuario_permissoes_select chama is_soma_staff() na sua própria policy;
-- sem security definer, avaliar is_soma_staff() dentro de uma query em
-- usuario_permissoes reaplica a RLS de usuario_permissoes, que chama
-- is_soma_staff() de novo — e o planner tentando expandir/inlinar isso
-- gera "stack depth limit exceeded" (confirmado ao vivo, pior que o
-- timeout original). security definer existia exatamente pra isso: evitar
-- reaplicar RLS nas leituras internas dessas funções.
--
-- Volta ao corpo de 20260925110000 (com security definer). A correção de
-- notas_distribuidas_select (restringir a is_soma_staff() só, desfazendo
-- o alargamento indevido pra tem_acesso_empresa) É mantida — essa parte
-- estava certa e não tem relação com o bug de recursão.

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

create or replace function public.is_soma_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.tem_permissao('empresas.ver');
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.tem_permissao('configuracoes.editar');
$$;

create or replace function public.is_legalizacao_analista()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.tem_permissao('legalizacao.ver');
$$;

create or replace function public.is_extratos_analista()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.tem_permissao('extratos.ver');
$$;

create or replace function public.is_financeiro_analista()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.tem_permissao('financeiro.ver');
$$;

create or replace function public.is_atendimento_analista()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.tem_permissao('atendimento.atender');
$$;

create or replace function public.pode_financeiro(target_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    public.is_soma_staff()
    or public.is_financeiro_analista()
    or public.tem_permissao('financeiro.ver', target_company_id),
    false
  );
$$;
