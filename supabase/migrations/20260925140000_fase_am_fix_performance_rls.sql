-- Fix de performance URGENTE (produção travando com "canceling statement
-- due to statement timeout" em /admin — confirmado no alerta do próprio
-- painel do Supabase de taxa de erro 5xx da Data API).
--
-- Causa raiz: is_soma_staff()/tem_permissao()/tem_acesso_empresa() eram
-- `security definer`. Funções security definer NUNCA são "inlinadas" pelo
-- planner do Postgres — cada linha da tabela grande (notas_distribuidas,
-- 34 mil+ linhas) força uma chamada de função opaca separada, com todo o
-- overhead de troca de contexto de segurança. A versão antiga de
-- is_soma_staff() era 1 SELECT simples em user_companies (papel único);
-- a nova faz JOIN usuario_permissoes+profiles — o mesmo problema já
-- existia em grau menor antes da fase AM, mas a chamada extra tornou
-- perceptível o que já era frágil.
--
-- Fix: remove `security definer` dessas funções. Sem ele, o Postgres pode
-- inlinar o corpo (SELECT único) diretamente na query externa, viabilizando
-- plano de índice/hash normal em vez de uma chamada de função por linha.
-- Isso só é seguro porque todas elas só leem linhas do PRÓPRIO usuário
-- (auth.uid()) — e tanto usuario_permissoes_select quanto profiles_select
-- já liberam isso via `user_id = auth.uid()`/`id = auth.uid()` (primeira
-- cláusula do OR, then short-circuit, sem recursão).
--
-- shares_company_with() FICA como security definer — ela precisa ler
-- linhas de OUTRO usuário (não é self-referencial), então não dá pra
-- tirar o bypass de RLS sem quebrar a função. Não está no caminho quente
-- de tabelas grandes (só usada em profiles_select/usuario_permissoes_select).

create or replace function public.tem_permissao(p_permissao text, p_company_id uuid default null)
returns boolean
language sql
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
set search_path = public
stable
as $$
  select public.tem_permissao('empresas.ver');
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
set search_path = public
stable
as $$
  select public.tem_permissao('configuracoes.editar');
$$;

create or replace function public.is_legalizacao_analista()
returns boolean
language sql
set search_path = public
stable
as $$
  select public.tem_permissao('legalizacao.ver');
$$;

create or replace function public.is_extratos_analista()
returns boolean
language sql
set search_path = public
stable
as $$
  select public.tem_permissao('extratos.ver');
$$;

create or replace function public.is_financeiro_analista()
returns boolean
language sql
set search_path = public
stable
as $$
  select public.tem_permissao('financeiro.ver');
$$;

create or replace function public.is_atendimento_analista()
returns boolean
language sql
set search_path = public
stable
as $$
  select public.tem_permissao('atendimento.atender');
$$;

create or replace function public.pode_financeiro(target_company_id uuid)
returns boolean
language sql
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

-- Corrige de passagem um bug real encontrado durante este diagnóstico:
-- a migration da virada (fase AM) reescreveu notas_distribuidas_select
-- usando "is_soma_staff() or tem_acesso_empresa(company_id)", mas a
-- versão vigente dessa policy (fase_i_fechamento_soma_only, 2026-08-19)
-- já tinha restringido a leitura a SÓ equipe SOMA — cliente não deve ver
-- notas_distribuidas de jeito nenhum. A reescrita na fase AM leu a versão
-- errada (a original, não a que a substituiu) e reabriu esse acesso sem
-- querer.
alter policy notas_distribuidas_select on public.notas_distribuidas
  using (public.is_soma_staff());
