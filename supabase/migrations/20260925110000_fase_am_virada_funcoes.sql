-- Fase AM — Redesenho de permissões: virada. Troca o CORPO das funções de
-- compatibilidade (mesmo nome, todas as ~130 policies que já as chamam
-- continuam funcionando sem serem tocadas) e reescreve, uma por uma, as
-- policies que comparavam contra user_company_role()/user_companies.role
-- diretamente (a "Forma A" do sistema antigo) — essas viram RLS fina de
-- verdade, escopada por tem_acesso_empresa()/tem_permissao(...).
--
-- Ordem importa: redefine as funções de compatibilidade primeiro (nada
-- muda de comportamento ainda, porque o backfill da migration anterior já
-- populou usuario_permissoes com o equivalente exato de cada role), depois
-- reescreve as policies que dependiam do enum diretamente, e só no fim
-- tenta apagar user_company_role() — se sobrou alguma policy usando a
-- função antiga, o DROP falha e a migration inteira desfaz sozinha.

-- ---------------------------------------------------------------------------
-- 1. Funções de compatibilidade — mesmo nome, corpo novo
-- ---------------------------------------------------------------------------
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

-- Antes: "colegas da mesma empresa" via join em user_companies. Agora: via
-- usuario_permissoes, mesma ideia (duas pessoas com qualquer permissão
-- escopada à mesma empresa "compartilham" ela, pra fins de profiles_select).
create or replace function public.shares_company_with(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.usuario_permissoes mine
    join public.usuario_permissoes theirs on theirs.company_id = mine.company_id
    where mine.user_id = auth.uid()
      and theirs.user_id = target_user_id
      and mine.company_id is not null
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Reescreve as policies que comparavam contra user_company_role()
--    diretamente — essas SIM mudam de forma (não só de corpo por trás).
-- ---------------------------------------------------------------------------

-- organizations
alter policy organizations_select on public.organizations
  using (
    public.is_soma_staff()
    or exists (
      select 1 from public.companies c
      where c.organization_id = organizations.id
        and public.tem_acesso_empresa(c.id)
    )
  );

-- companies (mantém exatamente os mesmos analistas que já enxergavam antes —
-- ANALISTA_ATENDIMENTO continua de fora, como já era)
alter policy companies_select on public.companies
  using (
    public.is_soma_staff()
    or public.tem_acesso_empresa(id)
    or public.is_legalizacao_analista()
    or public.is_extratos_analista()
    or public.is_financeiro_analista()
  );

-- dps / nfse / nfse_events / nfse_errors
alter policy dps_select on public.dps
  using (public.is_soma_staff() or public.tem_acesso_empresa(company_id));
alter policy dps_insert on public.dps
  with check (public.is_soma_staff() or public.tem_acesso_empresa(company_id));

alter policy nfse_select on public.nfse
  using (public.is_soma_staff() or public.tem_acesso_empresa(company_id));
alter policy nfse_insert on public.nfse
  with check (public.is_soma_staff() or public.tem_acesso_empresa(company_id));
alter policy nfse_update on public.nfse
  using (public.is_soma_staff() or public.tem_acesso_empresa(company_id));

alter policy nfse_events_select on public.nfse_events
  using (
    public.is_soma_staff()
    or exists (
      select 1 from public.nfse n
      where n.id = nfse_events.nfse_id and public.tem_acesso_empresa(n.company_id)
    )
  );
alter policy nfse_events_insert on public.nfse_events
  with check (
    public.is_soma_staff()
    or exists (
      select 1 from public.nfse n
      where n.id = nfse_events.nfse_id and public.tem_acesso_empresa(n.company_id)
    )
  );

alter policy nfse_errors_insert on public.nfse_errors
  with check (public.is_soma_staff() or public.tem_acesso_empresa(company_id));

-- notas_distribuidas (só staff lê hoje, mas a policy ainda cita a função antiga)
alter policy notas_distribuidas_select on public.notas_distribuidas
  using (public.is_soma_staff() or public.tem_acesso_empresa(company_id));

-- services / customers
alter policy services_select on public.services
  using (public.is_soma_staff() or public.tem_acesso_empresa(company_id));
alter policy customers_all on public.customers
  using (public.is_soma_staff() or public.tem_acesso_empresa(company_id))
  with check (public.is_soma_staff() or public.tem_acesso_empresa(company_id));

-- precificação (4 tabelas com company_id direto + 1 via join)
alter policy precificacao_parametros_all on public.precificacao_parametros
  using (public.is_soma_staff() or public.tem_acesso_empresa(company_id))
  with check (public.is_soma_staff() or public.tem_acesso_empresa(company_id));
alter policy precificacao_custos_fixos_all on public.precificacao_custos_fixos
  using (public.is_soma_staff() or public.tem_acesso_empresa(company_id))
  with check (public.is_soma_staff() or public.tem_acesso_empresa(company_id));
alter policy precificacao_insumos_all on public.precificacao_insumos
  using (public.is_soma_staff() or public.tem_acesso_empresa(company_id))
  with check (public.is_soma_staff() or public.tem_acesso_empresa(company_id));
alter policy precificacao_procedimentos_all on public.precificacao_procedimentos
  using (public.is_soma_staff() or public.tem_acesso_empresa(company_id))
  with check (public.is_soma_staff() or public.tem_acesso_empresa(company_id));
alter policy precificacao_procedimento_insumos_all on public.precificacao_procedimento_insumos
  using (
    exists (
      select 1 from public.precificacao_procedimentos p
      where p.id = procedimento_id
        and (public.is_soma_staff() or public.tem_acesso_empresa(p.company_id))
    )
  )
  with check (
    exists (
      select 1 from public.precificacao_procedimentos p
      where p.id = procedimento_id
        and (public.is_soma_staff() or public.tem_acesso_empresa(p.company_id))
    )
  );

-- claim_next_dps_number (plpgsql — dependência de função em função não é
-- rastreada pelo Postgres, por isso o drop de user_company_role no passo 4
-- não detectaria sozinho se esta ficasse esquecida; por isso reescrita aqui
-- explicitamente e conferida à parte na verificação).
create or replace function public.claim_next_dps_number(p_company_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number integer;
begin
  if not (public.is_soma_staff() or public.tem_acesso_empresa(p_company_id)) then
    raise exception 'Sem acesso a essa empresa.';
  end if;

  update public.companies
  set dps_next_number = dps_next_number + 1
  where id = p_company_id
  returning dps_next_number - 1 into v_number;

  if v_number is null then
    raise exception 'Empresa não encontrada.';
  end if;

  return v_number;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Congela user_companies — fica só como fonte histórica/backfill, não
--    aceita mais escrita de ninguém (nem staff). A tela nova escreve em
--    usuario_permissoes via RPC (próxima migration).
-- ---------------------------------------------------------------------------
drop policy user_companies_insert on public.user_companies;
drop policy user_companies_update on public.user_companies;
drop policy user_companies_delete on public.user_companies;

-- ---------------------------------------------------------------------------
-- 4. Rede de segurança: se alguma policy ainda usar user_company_role(),
--    este DROP falha e a migration inteira é desfeita.
-- ---------------------------------------------------------------------------
drop function public.user_company_role(uuid);
