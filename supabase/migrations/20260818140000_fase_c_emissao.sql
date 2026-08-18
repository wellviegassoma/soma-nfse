-- Fase C — Emissão: tributação mínima exigida pela DPS, numeração atômica,
-- e as tabelas de nota fiscal/erro/evento.

-- Campos que o dps_builder.py (motor portado) exige pra montar a DPS —
-- ver backend/dps_builder.py: totTrib é obrigatório, sem valor default
-- "seguro" (cálculo tributário errado tem consequência fiscal real, por
-- isso fica explícito por serviço, configurado pela SOMA).
alter table public.services
  add column percentual_total_tributos_federal numeric(5, 2),
  add column percentual_total_tributos_estadual numeric(5, 2),
  add column percentual_total_tributos_municipal numeric(5, 2),
  add column cst_pis_cofins text;

comment on column public.services.cst_pis_cofins is
  'CST do PIS/COFINS (Tabela II/III IN RFB 1.009/2010). "00" = Simples Nacional (sem apuração própria). Deixe nulo até confirmar com a contabilidade.';

-- ---------------------------------------------------------------------------
-- Numeração atômica da DPS — nunca reaproveitada, mesmo se a emissão falhar
-- (evita corrida entre duas emissões simultâneas da mesma empresa).
-- ---------------------------------------------------------------------------

create or replace function public.claim_next_dps_number(p_company_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number integer;
begin
  if not (public.is_soma_staff() or public.user_company_role(p_company_id) is not null) then
    raise exception 'Sem acesso a essa empresa.';
  end if;

  update public.companies
  set dps_next_number = dps_next_number + 1
  where id = p_company_id
  returning dps_next_number - 1 into v_number;

  if v_number is null then
    raise exception 'Empresa não encontrada.';
  end if;

  return v_number;
end;
$$;

-- ---------------------------------------------------------------------------
-- dps: cada tentativa de emissão (aceita ou rejeitada). nfse: só existe se
-- a dps correspondente foi aceita. nfse_errors: mensagem técnica crua,
-- nunca exposta ao cliente (só ao painel SOMA). nfse_events: cancelamento/
-- substituição — schema pronto, lógica só na Fase D.
-- ---------------------------------------------------------------------------

create type public.dps_status as enum ('ACCEPTED', 'REJECTED');

create table public.dps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  service_id uuid not null references public.services(id),
  numero_dps integer not null,
  serie text not null,
  id_dps text not null,
  valor numeric(12, 2) not null,
  descricao text not null,
  data_competencia date not null,
  status public.dps_status not null,
  xml_dps_assinado text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index dps_company_id_idx on public.dps(company_id);
create unique index dps_company_serie_numero_idx on public.dps(company_id, serie, numero_dps);

create table public.nfse (
  id uuid primary key default gen_random_uuid(),
  dps_id uuid not null unique references public.dps(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  access_key text unique,
  xml_nfse text,
  status text not null default 'AUTORIZADA',
  created_at timestamptz not null default now()
);
create index nfse_company_id_idx on public.nfse(company_id);

create table public.nfse_events (
  id uuid primary key default gen_random_uuid(),
  nfse_id uuid not null references public.nfse(id) on delete cascade,
  type text not null,
  reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.nfse_errors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  dps_id uuid references public.dps(id) on delete set null,
  technical_message text not null,
  user_message text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.dps enable row level security;
alter table public.nfse enable row level security;
alter table public.nfse_events enable row level security;
alter table public.nfse_errors enable row level security;

create policy dps_select on public.dps
  for select using (
    public.is_soma_staff() or public.user_company_role(company_id) is not null
  );
create policy dps_insert on public.dps
  for insert with check (
    public.is_soma_staff() or public.user_company_role(company_id) is not null
  );

create policy nfse_select on public.nfse
  for select using (
    public.is_soma_staff() or public.user_company_role(company_id) is not null
  );
create policy nfse_insert on public.nfse
  for insert with check (
    public.is_soma_staff() or public.user_company_role(company_id) is not null
  );

create policy nfse_events_select on public.nfse_events
  for select using (
    public.is_soma_staff()
    or exists (
      select 1 from public.nfse n
      where n.id = nfse_events.nfse_id and public.user_company_role(n.company_id) is not null
    )
  );
create policy nfse_events_insert on public.nfse_events
  for insert with check (
    public.is_soma_staff()
    or exists (
      select 1 from public.nfse n
      where n.id = nfse_events.nfse_id and public.user_company_role(n.company_id) is not null
    )
  );

-- nfse_errors: qualquer membro da empresa pode REGISTRAR (a própria tentativa
-- de emissão dele pode falhar), mas só a SOMA pode LER — o cliente nunca vê
-- mensagem técnica (ver docs/spec.md, "Se der erro").
create policy nfse_errors_select on public.nfse_errors
  for select using (public.is_soma_staff());
create policy nfse_errors_insert on public.nfse_errors
  for insert with check (
    public.is_soma_staff() or public.user_company_role(company_id) is not null
  );
