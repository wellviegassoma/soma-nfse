-- Fix de performance de verdade (a tentativa anterior de tirar security
-- definer causou recursão e foi revertida). A técnica correta, documentada
-- pelo próprio Supabase pra RLS lenta: envolver a chamada de função num
-- `(select ...)` dentro da policy. Isso não muda o resultado, mas dá uma
-- dica ao planner pra tratar a chamada como um InitPlan — calculado UMA
-- vez por execução da query, não uma vez por linha da tabela. security
-- definer continua intacto (não reabre o risco de recursão da tentativa
-- anterior).
--
-- notas_distribuidas_select é o caso mais grave: is_soma_staff() nem
-- depende de nenhuma coluna da linha (não tem company_id no using), então
-- sem esse hoist o Postgres ainda assim reavalia a função pra cada uma
-- das 34 mil+ linhas antes de aplicar o range() — daí o
-- "canceling statement due to statement timeout" que travou o /admin
-- (e o login de quem cai lá) hoje.
alter policy notas_distribuidas_select on public.notas_distribuidas
  using ((select public.is_soma_staff()));

alter policy dps_select on public.dps
  using ((select public.is_soma_staff()) or public.tem_acesso_empresa(company_id));
alter policy dps_insert on public.dps
  with check ((select public.is_soma_staff()) or public.tem_acesso_empresa(company_id));

alter policy nfse_select on public.nfse
  using ((select public.is_soma_staff()) or public.tem_acesso_empresa(company_id));
alter policy nfse_insert on public.nfse
  with check ((select public.is_soma_staff()) or public.tem_acesso_empresa(company_id));
alter policy nfse_update on public.nfse
  using ((select public.is_soma_staff()) or public.tem_acesso_empresa(company_id));

alter policy nfse_events_select on public.nfse_events
  using (
    (select public.is_soma_staff())
    or exists (
      select 1 from public.nfse n
      where n.id = nfse_events.nfse_id and public.tem_acesso_empresa(n.company_id)
    )
  );
alter policy nfse_events_insert on public.nfse_events
  with check (
    (select public.is_soma_staff())
    or exists (
      select 1 from public.nfse n
      where n.id = nfse_events.nfse_id and public.tem_acesso_empresa(n.company_id)
    )
  );

alter policy nfse_errors_select on public.nfse_errors
  using ((select public.is_soma_staff()));
alter policy nfse_errors_insert on public.nfse_errors
  with check ((select public.is_soma_staff()) or public.tem_acesso_empresa(company_id));

alter policy services_select on public.services
  using ((select public.is_soma_staff()) or public.tem_acesso_empresa(company_id));
alter policy customers_all on public.customers
  using ((select public.is_soma_staff()) or public.tem_acesso_empresa(company_id))
  with check ((select public.is_soma_staff()) or public.tem_acesso_empresa(company_id));

alter policy companies_select on public.companies
  using (
    (select public.is_soma_staff())
    or public.tem_acesso_empresa(id)
    or (select public.is_legalizacao_analista())
    or (select public.is_extratos_analista())
    or (select public.is_financeiro_analista())
  );

alter policy organizations_select on public.organizations
  using (
    (select public.is_soma_staff())
    or exists (
      select 1 from public.companies c
      where c.organization_id = organizations.id
        and public.tem_acesso_empresa(c.id)
    )
  );

alter policy precificacao_parametros_all on public.precificacao_parametros
  using ((select public.is_soma_staff()) or public.tem_acesso_empresa(company_id))
  with check ((select public.is_soma_staff()) or public.tem_acesso_empresa(company_id));
alter policy precificacao_custos_fixos_all on public.precificacao_custos_fixos
  using ((select public.is_soma_staff()) or public.tem_acesso_empresa(company_id))
  with check ((select public.is_soma_staff()) or public.tem_acesso_empresa(company_id));
alter policy precificacao_insumos_all on public.precificacao_insumos
  using ((select public.is_soma_staff()) or public.tem_acesso_empresa(company_id))
  with check ((select public.is_soma_staff()) or public.tem_acesso_empresa(company_id));
alter policy precificacao_procedimentos_all on public.precificacao_procedimentos
  using ((select public.is_soma_staff()) or public.tem_acesso_empresa(company_id))
  with check ((select public.is_soma_staff()) or public.tem_acesso_empresa(company_id));
alter policy precificacao_procedimento_insumos_all on public.precificacao_procedimento_insumos
  using (
    exists (
      select 1 from public.precificacao_procedimentos p
      where p.id = procedimento_id
        and ((select public.is_soma_staff()) or public.tem_acesso_empresa(p.company_id))
    )
  )
  with check (
    exists (
      select 1 from public.precificacao_procedimentos p
      where p.id = procedimento_id
        and ((select public.is_soma_staff()) or public.tem_acesso_empresa(p.company_id))
    )
  );

-- Tabelas grandes de leitura só-staff que já existiam antes da fase AM —
-- mesmo problema (is_soma_staff() por linha sem hoist), mesma correção.
alter policy folha_mensal_select on public.folha_mensal
  using ((select public.is_soma_staff()));
alter policy receita_mensal_manual_select on public.receita_mensal_manual
  using ((select public.is_soma_staff()));
alter policy certificates_all on public.certificates
  using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
