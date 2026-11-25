-- Fase CP — Extratos, Fase 3 (pedido de 25/11/2026):
-- 1) Extratos que o cliente manda no grupo do WhatsApp (Digisac) são
--    capturados pelo webhook, lidos e registrados — só internamente, sem
--    resposta ao cliente. origem_mensagem_id evita processar a mesma
--    mensagem duas vezes.
-- 2) Régua automática de cobrança: config única (liga/desliga, dias) e o
--    tipo de cada cobrança no histórico.

alter table public.extrato_arquivos
  add column if not exists origem_mensagem_id text;
create unique index if not exists extrato_arquivos_origem_mensagem_uniq
  on public.extrato_arquivos(origem_mensagem_id) where origem_mensagem_id is not null;

alter table public.extrato_cobrancas
  add column if not exists tipo text not null default 'MANUAL'
    check (tipo in ('MANUAL','AUTO_COBRANCA','AUTO_LEMBRETE'));
-- Envio automático não tem usuário.
comment on column public.extrato_cobrancas.enviado_por is 'Quem enviou; null = régua automática.';

create table if not exists public.extrato_regua_config (
  id boolean primary key default true check (id),   -- linha única
  ativa boolean not null default false,
  dia_cobranca smallint not null default 3 check (dia_cobranca between 1 and 28),
  dia_lembrete smallint not null default 8 check (dia_lembrete between 1 and 28),
  alterado_por uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
comment on table public.extrato_regua_config is
  'Régua automática de cobrança de extratos: no 1º dia útil a partir de dia_cobranca manda a cobrança do mês anterior; a partir de dia_lembrete, lembrete só do que ainda falta. Começa desligada.';
insert into public.extrato_regua_config (id) values (true) on conflict (id) do nothing;

alter table public.extrato_regua_config enable row level security;

drop policy if exists extrato_regua_config_select on public.extrato_regua_config;
create policy extrato_regua_config_select on public.extrato_regua_config
  for select using ((select public.tem_permissao('extratos.ver')));

drop policy if exists extrato_regua_config_update on public.extrato_regua_config;
create policy extrato_regua_config_update on public.extrato_regua_config
  for update using ((select public.tem_permissao('extratos.editar')))
  with check ((select public.tem_permissao('extratos.editar')));
