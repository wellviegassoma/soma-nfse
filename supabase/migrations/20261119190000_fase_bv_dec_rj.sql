-- Fase BV: DeC da SEFAZ-RJ (Domicílio Eletrônico do Contribuinte) na Central
-- de Intimações (pedido de 19/11/2026). Lido pela Infosimples
-- (sefaz/rj/dec/caixa-postal) com o certificado da SOMA e SEMPRE com
-- ignora_nao_lidas=1: as mensagens não lidas NÃO são abertas (abrir no DeC dá
-- ciência). As mensagens vão para public.caixa_postal_mensagens com isn
-- prefixado "DEC:" e tipo_origem 2 (Estado).
--
-- Só contribuinte do ICMS-RJ tem DeC. O SOMA não guarda a inscrição estadual,
-- então a primeira leitura descobre: empresa sem DeC (ou sem e-Procuração
-- para a SOMA) fica com ativo = false e sai das leituras seguintes.
create table if not exists public.dec_rj_leituras (
  company_id uuid primary key references public.companies(id) on delete cascade,
  ativo boolean not null default true,
  lida_em timestamptz not null default now(),
  ok boolean not null,
  erro text,
  quantidade integer not null default 0,
  nao_lidas integer not null default 0,
  novas integer not null default 0
);

alter table public.dec_rj_leituras enable row level security;

drop policy if exists dec_rj_leituras_all on public.dec_rj_leituras;
create policy dec_rj_leituras_all on public.dec_rj_leituras
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
