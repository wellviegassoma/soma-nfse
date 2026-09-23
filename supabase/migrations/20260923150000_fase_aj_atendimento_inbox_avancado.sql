-- Inbox precisa de, sem N+1 por ticket a cada render da lista: (1) data e
-- prévia da última mensagem, (2) contador de não lida por aba, (3) saber
-- quando destacar "aguardando resposta". Tudo denormalizado em
-- atendimento_tickets, mantido por trigger em atendimento_mensagens —
-- pedido direto testando, usando o Digisac como referência visual.

alter table public.atendimento_tickets
  add column ultima_mensagem_em timestamptz,
  add column ultima_mensagem_preview text,
  add column ultima_mensagem_remetente_tipo text,
  add column nao_lida boolean not null default true;

comment on column public.atendimento_tickets.nao_lida is
  'Vira true de novo a cada mensagem CONTATO nova (trigger); só volta a false quando um atendente abre a tela do chamado (ver app/atendimento/[ticketId]/page.tsx) — não quando ele responde, porque responder já implica ter aberto.';

comment on column public.atendimento_tickets.ultima_mensagem_remetente_tipo is
  'CONTATO aqui = "aguardando resposta" na lista, independente de nao_lida (chamado pode já estar lido mas ainda sem resposta).';

create or replace function public.atendimento_atualizar_ultima_mensagem()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Nota interna e log de transferência (SISTEMA) não são "a conversa"
  -- pro cliente — não viram preview nem disparam badge de não lida.
  if new.interno or new.remetente_tipo = 'SISTEMA' then
    return new;
  end if;

  update public.atendimento_tickets
  set
    ultima_mensagem_em = new.created_at,
    ultima_mensagem_preview = left(coalesce(new.corpo, ''), 140),
    ultima_mensagem_remetente_tipo = new.remetente_tipo,
    nao_lida = case when new.remetente_tipo = 'CONTATO' then true else nao_lida end
  where id = new.ticket_id;

  return new;
end;
$$;

create trigger atendimento_mensagens_atualizar_ticket
  after insert on public.atendimento_mensagens
  for each row execute function public.atendimento_atualizar_ultima_mensagem();

-- Backfill dos tickets de teste que já existem — sem isso ficariam sem
-- preview/data até a próxima mensagem.
with ultima as (
  select distinct on (ticket_id)
    ticket_id, created_at, corpo, remetente_tipo
  from public.atendimento_mensagens
  where not interno and remetente_tipo <> 'SISTEMA'
  order by ticket_id, created_at desc
)
update public.atendimento_tickets t
set
  ultima_mensagem_em = u.created_at,
  ultima_mensagem_preview = left(coalesce(u.corpo, ''), 140),
  ultima_mensagem_remetente_tipo = u.remetente_tipo,
  nao_lida = (u.remetente_tipo = 'CONTATO')
from ultima u
where u.ticket_id = t.id;
