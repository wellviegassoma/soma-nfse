-- Conferência do Simples Nacional antes da transmissão do PGDAS-D.
--
-- A conferência em si é calculada na hora (lib/simples-conferencia.ts) —
-- aqui só fica a APROVAÇÃO de quem estava em "Revisar": quem aprovou,
-- quando, com que observação, e a "assinatura" dos números que estavam na
-- tela no momento da aprovação. Se os números mudarem depois (nota nova,
-- folha corrigida, RBT12 importado), a assinatura atual deixa de bater e
-- a aprovação perde o efeito sozinha — a empresa volta pra "Revisar" em
-- vez de transmitir um valor que ninguém viu.
--
-- A rota de transmissão (integra-contador/simples/declarar) consulta esta
-- tabela no servidor antes de transmitir; o filtro da tela é só conforto.
create table public.simples_conferencia_aprovacoes (
  company_id uuid not null references public.companies(id) on delete cascade,
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  assinatura text not null,
  motivos jsonb not null default '[]'::jsonb, -- motivos que estavam em aberto quando aprovou (histórico)
  observacao text,
  aprovado_em timestamptz not null default now(),
  aprovado_por uuid references public.profiles(id) on delete set null,
  primary key (company_id, competencia)
);

create index simples_conferencia_aprovacoes_competencia_idx
  on public.simples_conferencia_aprovacoes (competencia);

alter table public.simples_conferencia_aprovacoes enable row level security;

create policy simples_conferencia_aprovacoes_all on public.simples_conferencia_aprovacoes
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
