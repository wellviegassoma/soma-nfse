-- Central FGTS passa a consultar qualquer competência (e "últimos N
-- meses"), não só o mês anterior. A Infosimples traz as guias de um
-- período por chamada, então o resultado vira uma linha por empresa E
-- competência — antes era uma linha por empresa, sempre do mês anterior.
--
-- `periodo` no formato da Infosimples (AAAAMM). As linhas que já existem
-- foram todas consultadas com o padrão de então (mês anterior ao da
-- consulta, horário de Brasília) — o backfill reconstrói isso.
alter table public.fgts_guias_consultas add column periodo text;

update public.fgts_guias_consultas
  set periodo = to_char(
    date_trunc('month', consultado_em at time zone 'America/Sao_Paulo') - interval '1 month',
    'YYYYMM'
  );

-- Padrão = mês anterior (o comportamento de antes): a migration é
-- aplicada antes do deploy do código novo, e o código antigo — que não
-- manda `periodo` — continua gravando certo nesse intervalo.
alter table public.fgts_guias_consultas
  alter column periodo set default to_char(
    date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '1 month',
    'YYYYMM'
  ),
  alter column periodo set not null,
  add constraint fgts_guias_consultas_periodo_check check (periodo ~ '^\d{6}$');

alter table public.fgts_guias_consultas drop constraint fgts_guias_consultas_pkey;
alter table public.fgts_guias_consultas add primary key (company_id, periodo);
