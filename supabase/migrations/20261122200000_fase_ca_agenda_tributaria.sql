-- Fase CA: Agenda Tributária da Receita Federal na Visão geral (pedido de
-- 22/11/2026).
--
-- Fonte: todo mês a RFB publica um ADE Corat com a agenda do mês seguinte e
-- anexa uma planilha .xlsx (abas "Tributos" e "Declarações") na página
-- gov.br/receitafederal/pt-br/assuntos/agenda-tributaria/AAAA/<Mês>. A
-- rotina /api/cron/agenda-tributaria importa essa planilha (ou, quando o mês
-- só tem PDF, as tabelas das páginas de cada dia) — a agenda do sistema é a
-- própria agenda oficial, sem regra de vencimento calculada aqui.

create table if not exists public.agenda_tributaria_meses (
  mes date primary key check (extract(day from mes) = 1),  -- 1º dia do mês
  ade text,                     -- ex.: "ADE Corat nº 85 de 27/10/26"
  fonte_url text,
  origem text not null check (origem in ('XLSX', 'HTML', 'UPLOAD')),
  qtd_tributos int not null default 0,
  qtd_declaracoes int not null default 0,
  importado_em timestamptz not null default now()
);

create table if not exists public.agenda_tributaria_itens (
  id bigint generated always as identity primary key,
  mes date not null references public.agenda_tributaria_meses(mes) on delete cascade,
  tipo text not null check (tipo in ('TRIBUTO', 'DECLARACAO')),
  ordem int not null,           -- ordem da linha na planilha oficial
  dia int,                      -- dia do vencimento; 0 = diário; null = prazo em texto
  dia_texto text,               -- prazo quando não é um dia fixo
  vencimento date,              -- mes + dia (null quando diário ou em texto)
  codigo text,                  -- código de receita (DARF); "--" vira null
  grupo text,                   -- tributo (TRIBUTO) ou interessado PJ/PF (DECLARACAO)
  descricao text not null,
  periodo text,                 -- período de apuração / de referência
  periodicidade text,
  documento text,               -- DARF, DAS, GPS, DAE...
  declaracao text,              -- categoria da declaração (DCTFWeb...)
  origem_escrituracao text,
  fundamentacao text
);

create index if not exists agenda_tributaria_itens_mes_idx
  on public.agenda_tributaria_itens (mes, ordem);

alter table public.agenda_tributaria_meses enable row level security;
alter table public.agenda_tributaria_itens enable row level security;

drop policy if exists agenda_tributaria_meses_all on public.agenda_tributaria_meses;
create policy agenda_tributaria_meses_all on public.agenda_tributaria_meses
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));

drop policy if exists agenda_tributaria_itens_all on public.agenda_tributaria_itens;
create policy agenda_tributaria_itens_all on public.agenda_tributaria_itens
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));

-- Troca a agenda de um mês inteira numa transação só (a rotina e o botão
-- "Reimportar" chamam isso): apaga os itens antigos e grava os novos.
create or replace function public.agenda_tributaria_substituir_mes(
  p_mes date, p_ade text, p_fonte_url text, p_origem text, p_itens jsonb
) returns int
language plpgsql
security invoker
set search_path = public
as $$
declare n int;
begin
  insert into agenda_tributaria_meses (mes, ade, fonte_url, origem, importado_em)
  values (p_mes, p_ade, p_fonte_url, p_origem, now())
  on conflict (mes) do update
    set ade = excluded.ade, fonte_url = excluded.fonte_url,
        origem = excluded.origem, importado_em = now();

  delete from agenda_tributaria_itens where mes = p_mes;

  insert into agenda_tributaria_itens (
    mes, tipo, ordem, dia, dia_texto, vencimento, codigo, grupo, descricao, periodo,
    periodicidade, documento, declaracao, origem_escrituracao, fundamentacao)
  select p_mes, i.tipo, i.ordem, i.dia, i.dia_texto, i.vencimento, i.codigo, i.grupo,
         i.descricao, i.periodo, i.periodicidade, i.documento, i.declaracao,
         i.origem_escrituracao, i.fundamentacao
  from jsonb_to_recordset(p_itens) as i(
    tipo text, ordem int, dia int, dia_texto text, vencimento date, codigo text, grupo text,
    descricao text, periodo text, periodicidade text, documento text, declaracao text,
    origem_escrituracao text, fundamentacao text);
  get diagnostics n = row_count;

  update agenda_tributaria_meses
     set qtd_tributos = (select count(*) from agenda_tributaria_itens where mes = p_mes and tipo = 'TRIBUTO'),
         qtd_declaracoes = (select count(*) from agenda_tributaria_itens where mes = p_mes and tipo = 'DECLARACAO')
   where mes = p_mes;
  return n;
end $$;

revoke all on function public.agenda_tributaria_substituir_mes(date, text, text, text, jsonb) from public, anon;
grant execute on function public.agenda_tributaria_substituir_mes(date, text, text, text, jsonb) to authenticated, service_role;
