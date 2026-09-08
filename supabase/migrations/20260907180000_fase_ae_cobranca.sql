-- Fase AE — Módulo Financeiro, F5: cobrança.
--
-- Boleto ficou FORA do escopo por decisão do Wellington (a SOMA não emite
-- boleto pelo Nibo hoje), então esta fase é: régua de cobrança + vínculo da
-- conta a receber com a NFS-e que o próprio sistema emite.
--
-- Não existe "fin_faturas": uma fatura É uma conta a receber. Criar uma tabela
-- separada duplicaria o conceito e obrigaria todo relatório a somar os dois
-- lugares. O que a conta a receber ganhou foi o vínculo com a nota.

-- ---------------------------------------------------------------------------
-- Vínculo com a NFS-e
--
-- Só o vínculo é gravado aqui. A EMISSÃO continua exclusivamente pelo fluxo já
-- validado (issueNfse / tela Emitir Nota) — emitir nota tem efeito legal e não
-- vale a pena ter um segundo caminho pra isso.
-- ---------------------------------------------------------------------------

alter table public.fin_agendamentos
  add column dps_id uuid references public.dps(id) on delete set null;

comment on column public.fin_agendamentos.dps_id is
  'NFS-e emitida para esta conta a receber. Só o vínculo — a emissão continua pelo fluxo validado em issueNfse.';

-- Uma nota não pode ser vinculada a duas contas a receber (seria cobrar duas
-- vezes o mesmo documento fiscal).
create unique index fin_agendamentos_dps_id_idx
  on public.fin_agendamentos(dps_id) where dps_id is not null;

-- ---------------------------------------------------------------------------
-- fin_cobranca_etapas — a régua
--
-- Cada etapa é um ponto no tempo relativo ao vencimento: -3 = três dias antes
-- (lembrete), 0 = no dia, +7 = uma semana de atraso. Guardar relativo, e não
-- data absoluta, é o que faz a régua valer pra toda conta sem recalcular nada.
-- ---------------------------------------------------------------------------

create table public.fin_cobranca_etapas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nome text not null,
  dias_relativos integer not null,
  canal text not null default 'EMAIL'
    check (canal in ('EMAIL', 'WHATSAPP', 'TELEFONE', 'OUTRO')),
  -- Placeholders trocados na hora de montar o texto: {cliente}, {valor},
  -- {vencimento}, {descricao}, {dias_atraso}, {empresa}.
  template text not null,
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, dias_relativos, canal)
);
comment on table public.fin_cobranca_etapas is
  'Régua de cobrança por empresa. dias_relativos é relativo ao vencimento: negativo antes, 0 no dia, positivo em atraso.';

create index fin_cobranca_etapas_company_idx on public.fin_cobranca_etapas(company_id);

-- ---------------------------------------------------------------------------
-- fin_cobranca_envios — o que já foi cobrado
--
-- O sistema NÃO envia e-mail nem WhatsApp (o projeto não tem provedor de
-- e-mail configurado): ele monta o texto e registra o envio quando o operador
-- confirma. Sem esse registro a régua não teria memória e o cliente levaria a
-- mesma cobrança várias vezes.
-- ---------------------------------------------------------------------------

create table public.fin_cobranca_envios (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agendamento_id uuid not null references public.fin_agendamentos(id) on delete cascade,
  -- Nulo quando foi uma cobrança avulsa, fora da régua.
  etapa_id uuid references public.fin_cobranca_etapas(id) on delete set null,
  canal text not null check (canal in ('EMAIL', 'WHATSAPP', 'TELEFONE', 'OUTRO')),
  observacao text,
  enviado_em timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  -- Mesma etapa não é registrada duas vezes pra mesma conta.
  unique (agendamento_id, etapa_id)
);
comment on table public.fin_cobranca_envios is
  'Histórico de cobrança registrada. O envio em si é manual (não há provedor de e-mail no projeto); aqui fica a memória pra régua não repetir a mesma etapa.';

create index fin_cobranca_envios_agendamento_idx
  on public.fin_cobranca_envios(agendamento_id);
create index fin_cobranca_envios_company_idx on public.fin_cobranca_envios(company_id);

create trigger fin_cobranca_etapas_set_updated_at before update on public.fin_cobranca_etapas
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — mesmo recorte por empresa das fases anteriores
-- ---------------------------------------------------------------------------

alter table public.fin_cobranca_etapas enable row level security;
alter table public.fin_cobranca_envios enable row level security;

create policy fin_cobranca_etapas_all on public.fin_cobranca_etapas
  for all using (public.pode_financeiro(company_id))
  with check (public.pode_financeiro(company_id));

create policy fin_cobranca_envios_all on public.fin_cobranca_envios
  for all using (public.pode_financeiro(company_id))
  with check (public.pode_financeiro(company_id));

-- ---------------------------------------------------------------------------
-- Régua padrão, semeada por empresa na primeira vez que a tela abre
-- (mesmo padrão de fin_seed_categorias_padrao: idempotente, sob demanda).
-- ---------------------------------------------------------------------------

create or replace function public.fin_seed_cobranca_padrao(p_company_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (select 1 from public.fin_cobranca_etapas where company_id = p_company_id) then
    return;
  end if;

  insert into public.fin_cobranca_etapas (company_id, nome, dias_relativos, canal, template)
  values
    (p_company_id, 'Lembrete antes do vencimento', -3, 'EMAIL',
     'Olá, {cliente}. Passando pra lembrar que {descricao} vence em {vencimento}, no valor de {valor}. Qualquer dúvida, é só chamar.'),
    (p_company_id, 'No dia do vencimento', 0, 'WHATSAPP',
     'Olá, {cliente}. {descricao} vence hoje ({vencimento}), no valor de {valor}. Se já pagou, pode desconsiderar.'),
    (p_company_id, 'Primeiro aviso de atraso', 3, 'WHATSAPP',
     'Olá, {cliente}. Consta em aberto {descricao}, que venceu em {vencimento} ({dias_atraso} dias), no valor de {valor}. Pode confirmar se o pagamento foi feito?'),
    (p_company_id, 'Segundo aviso de atraso', 7, 'EMAIL',
     'Olá, {cliente}. {descricao} segue em aberto desde {vencimento} — {dias_atraso} dias de atraso, valor de {valor}. Precisamos regularizar; se houver alguma dificuldade, entre em contato pra combinarmos uma solução.'),
    (p_company_id, 'Contato direto', 15, 'TELEFONE',
     'Ligar para {cliente} sobre {descricao}, vencida em {vencimento} ({dias_atraso} dias), valor {valor}.'),
    (p_company_id, 'Notificação final', 30, 'EMAIL',
     'Olá, {cliente}. {descricao} está vencida há {dias_atraso} dias, no valor de {valor}. Sem retorno, o débito será encaminhado para as providências de cobrança cabíveis. Ainda dá tempo de resolver: entre em contato.');
end;
$$;

comment on function public.fin_seed_cobranca_padrao(uuid) is
  'Semeia a régua de cobrança padrão da empresa. Idempotente: não faz nada se já houver qualquer etapa.';
