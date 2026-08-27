-- Cada conta bancária pode ter um período de controle de extrato diferente
-- (ex.: conta aberta há 2 anos, ou encerrada num mês específico) — sem
-- essas datas, o sistema continua usando a janela padrão (últimos N meses),
-- mesmo comportamento de antes. Nullable pra não quebrar contas já
-- cadastradas.
alter table public.extrato_contas_bancarias
  add column data_inicio_controle date,
  add column data_fim_controle date;
