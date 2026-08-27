-- Bug pego ao testar ao vivo: os papéis novos (ANALISTA_LEGALIZACAO,
-- ANALISTA_CONTABIL) têm acesso liberado só nas tabelas dos próprios
-- módulos (legalizacao_*, extrato_*) — mas a policy de `companies` continua
-- só deixando SOMA staff ou quem tem vínculo direto com aquela empresa
-- específica ler a linha. Como o vínculo desses papéis em user_companies é
-- só incidental (a mesma linha "pra existir" que staff usa), eles não
-- conseguiam ver NENHUMA empresa de verdade — só a linha especial da SOMA
-- que o convite usou. Sem enxergar `companies`, os dois módulos ficam
-- inutilizáveis (não tem como listar/abrir empresa nenhuma).

alter policy companies_select on public.companies
  using (
    public.is_soma_staff()
    or public.user_company_role(id) is not null
    or public.is_legalizacao_analista()
    or public.is_extratos_analista()
  );
