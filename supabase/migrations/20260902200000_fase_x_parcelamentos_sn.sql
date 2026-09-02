-- Fase X — Central de Parcelamentos (Simples Nacional / PARCSN). Estado
-- dos parcelamentos encontrados por empresa, populado pelo botão
-- "Verificar" (frontend, logo após PEDIDOSPARC163 + OBTERPARC164) —
-- mesmo espírito de integra_contador_mit_encerramentos (20260901220000),
-- mas aqui é ESTADO (upsert por parcelamento), não histórico de
-- transmissão. Uma empresa pode ter mais de um parcelamento (histórico
-- de pedidos anteriores encerrados) — por isso uma linha por
-- parcelamento, não por empresa. Formato dos campos confirmado contra a
-- Serpro em 2026-09-02 (Passo 0 da Central de Parcelamentos).

create table public.integra_contador_parcelamentos_sn (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  numero_parcelamento bigint not null,
  situacao text not null, -- texto cru da Serpro: "Em parcelamento", "Encerrado a Pedido do Contribuinte", etc.
  data_pedido date,
  data_situacao date,
  parcelas_total integer,
  parcelas_pagas integer,
  parcela_atual integer, -- parcelas_pagas + 1 (limitado a parcelas_total)
  parcelas_em_atraso boolean not null default false,
  valor_total_consolidado numeric(14, 2),
  valor_parcela_basica numeric(14, 2),
  ultima_parcela_paga_competencia text, -- "YYYY-MM" do último pagamento confirmado
  detalhe jsonb not null, -- resposta bruta do OBTERPARC164, referência futura
  checked_at timestamptz not null default now(),
  unique (company_id, numero_parcelamento)
);

create index integra_contador_parcelamentos_sn_company_idx
  on public.integra_contador_parcelamentos_sn (company_id);

alter table public.integra_contador_parcelamentos_sn enable row level security;

create policy integra_contador_parcelamentos_sn_all on public.integra_contador_parcelamentos_sn
  for all using (public.is_soma_staff()) with check (public.is_soma_staff());
