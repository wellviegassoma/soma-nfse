-- Fase CO — Extratos: fluxo de trabalho + leitura por IA (pedido de
-- 24/11/2026, "módulo muito travado").
--
-- 1) Status único por conta/mês no lugar de dois checkboxes. As colunas
--    entregue/conciliado continuam e são mantidas em sincronia pelo trigger
--    (tarefas-automacao, chat-ia e Financeiro leem "entregue").
--      PENDENTE → RECEBIDO → CONFERIDO → CONCILIADO
--      SEM_MOVIMENTO (cliente informou que não houve) e ENCERRADA contam
--      como resolvidos.
--
-- 2) extrato_arquivos: cada arquivo recebido (upload, lote ou WhatsApp) com a
--    leitura feita (OFX determinístico ou IA): banco, conta, período, saldos
--    e avisos. Um mês pode ter mais de um arquivo. Arquivo sem conta/mês
--    definido fica na fila de confirmação.

alter table public.extratos_mensais
  add column if not exists status text not null default 'PENDENTE'
    check (status in ('PENDENTE','RECEBIDO','CONFERIDO','CONCILIADO','SEM_MOVIMENTO','ENCERRADA'));

update public.extratos_mensais
   set status = case when conciliado then 'CONCILIADO' when entregue then 'RECEBIDO' else 'PENDENTE' end
 where status = 'PENDENTE';

create or replace function public.extratos_mensais_sync_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Código antigo que só mexe nos booleanos continua funcionando: o status
  -- é derivado deles quando não veio junto.
  if (tg_op = 'INSERT' and new.status = 'PENDENTE' and (new.entregue or new.conciliado))
     or (tg_op = 'UPDATE' and new.status is not distinct from old.status
         and (new.entregue is distinct from old.entregue or new.conciliado is distinct from old.conciliado)) then
    new.status := case when new.conciliado then 'CONCILIADO' when new.entregue then 'RECEBIDO' else 'PENDENTE' end;
  end if;
  new.entregue := new.status in ('RECEBIDO','CONFERIDO','CONCILIADO','SEM_MOVIMENTO','ENCERRADA');
  new.conciliado := new.status = 'CONCILIADO';
  return new;
end;
$$;

drop trigger if exists extratos_mensais_sync_status on public.extratos_mensais;
create trigger extratos_mensais_sync_status before insert or update on public.extratos_mensais
  for each row execute function public.extratos_mensais_sync_status();

create table if not exists public.extrato_arquivos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  conta_id uuid references public.extrato_contas_bancarias(id) on delete set null,
  competencia text,                        -- YYYY-MM (mês principal coberto)
  blob_url text not null,
  blob_pathname text not null,
  nome_arquivo text not null,
  mime text,
  tamanho integer,
  origem text not null default 'UPLOAD' check (origem in ('UPLOAD','LOTE','WHATSAPP')),
  situacao text not null default 'PROCESSANDO'
    check (situacao in ('PROCESSANDO','IDENTIFICADO','CONFIRMAR','ERRO','DESCARTADO')),
  leitura jsonb,                            -- {metodo, banco, agencia, conta, titular_documento, periodo_inicio, periodo_fim, saldo_inicial, saldo_final, ...}
  avisos jsonb not null default '[]'::jsonb, -- [{codigo, mensagem}]
  ia_modelo text,
  ia_custo_usd numeric(10,5),
  enviado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.extrato_arquivos is
  'Arquivos de extrato recebidos e a leitura feita (OFX ou IA). situacao=CONFIRMAR fica na fila para alguém escolher empresa/conta/mês.';
create index if not exists extrato_arquivos_conta_comp_idx on public.extrato_arquivos(conta_id, competencia);
create index if not exists extrato_arquivos_company_idx on public.extrato_arquivos(company_id, created_at desc);
create index if not exists extrato_arquivos_situacao_idx on public.extrato_arquivos(situacao) where situacao in ('CONFIRMAR','PROCESSANDO','ERRO');

drop trigger if exists extrato_arquivos_set_updated_at on public.extrato_arquivos;
create trigger extrato_arquivos_set_updated_at before update on public.extrato_arquivos
  for each row execute function public.set_updated_at();

alter table public.extrato_arquivos enable row level security;

drop policy if exists extrato_arquivos_select on public.extrato_arquivos;
create policy extrato_arquivos_select on public.extrato_arquivos
  for select using ((select public.tem_permissao('extratos.ver')));

drop policy if exists extrato_arquivos_write on public.extrato_arquivos;
create policy extrato_arquivos_write on public.extrato_arquivos
  for all using ((select public.tem_permissao('extratos.editar')))
  with check ((select public.tem_permissao('extratos.editar')));
