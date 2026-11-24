-- Fase CN — cobrança de extratos pelo WhatsApp (Digisac). Pedido de
-- 24/11/2026: a partir da carteira do responsável pela contabilidade
-- (companies.responsavel_contabil_id), a tela /extratos/cobranca lista o que
-- falta e manda uma mensagem por empresa no grupo dela. Cada envio fica
-- registrado aqui — mostra "cobrado em …" e evita cobrar duas vezes no dia.

create table if not exists public.extrato_cobrancas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  competencia text not null,                -- competência de referência (YYYY-MM)
  itens jsonb not null default '[]'::jsonb, -- [{contaId, banco, agencia, conta, meses: [YYYY-MM]}]; vazio = empresa sem conta cadastrada
  contact_id text not null,                 -- contato/grupo do Digisac
  grupo_nome text,
  texto text not null,
  enviado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.extrato_cobrancas is
  'Histórico de cobranças de extrato enviadas pelo WhatsApp (Digisac), uma linha por empresa/envio.';
create index if not exists extrato_cobrancas_company_idx on public.extrato_cobrancas(company_id, created_at desc);

alter table public.extrato_cobrancas enable row level security;

drop policy if exists extrato_cobrancas_select on public.extrato_cobrancas;
create policy extrato_cobrancas_select on public.extrato_cobrancas
  for select using ((select public.tem_permissao('extratos.ver')));

drop policy if exists extrato_cobrancas_insert on public.extrato_cobrancas;
create policy extrato_cobrancas_insert on public.extrato_cobrancas
  for insert with check ((select public.tem_permissao('extratos.editar')));
