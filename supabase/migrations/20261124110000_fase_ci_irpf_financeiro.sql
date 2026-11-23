-- IRPF: financeiro dos honorários (aba Financeiro, pedido do Wellington
-- 24/11/2026) — vencimento, data e forma do pagamento por declaração.
alter table public.irpf_declaracoes
  add column if not exists honorario_vencimento date,
  add column if not exists honorario_pago_em date,
  add column if not exists honorario_forma text;
create index if not exists irpf_declaracoes_honorario_idx on public.irpf_declaracoes(exercicio, honorario_status);
