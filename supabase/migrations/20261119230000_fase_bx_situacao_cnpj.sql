-- Fase BX: situação cadastral do CNPJ de toda a carteira, toda semana, pela
-- BrasilAPI (pedido de 19/11/2026). Se a situação sair de ATIVA (inapta,
-- suspensa, baixada, nula), a rotina cria uma mensagem de ALERTA MÁXIMO na
-- Central de Intimações (caixa_postal_mensagens, isn "CNPJ:…"), com a mesma
-- fila de tratamento, e a tela mostra um aviso vermelho no topo.
create table if not exists public.cnpj_situacoes (
  company_id uuid primary key references public.companies(id) on delete cascade,
  situacao text,                 -- ATIVA, INAPTA, SUSPENSA, BAIXADA, NULA
  data_situacao date,
  motivo text,
  situacao_especial text,
  situacao_anterior text,
  mudou_em timestamptz,          -- quando o SOMA viu a mudança
  verificado_em timestamptz not null default now(),
  ok boolean not null,
  erro text
);

alter table public.cnpj_situacoes enable row level security;

drop policy if exists cnpj_situacoes_all on public.cnpj_situacoes;
create policy cnpj_situacoes_all on public.cnpj_situacoes
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
