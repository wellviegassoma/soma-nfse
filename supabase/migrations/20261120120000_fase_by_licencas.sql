-- Fase BY: controle de alvarás e licenças (pedido de 20/11/2026), fase 1.
--
-- 1) A licença ganha número, órgão emissor e data de emissão.
-- 2) Histórico: ao anexar uma licença nova do mesmo tipo, a anterior vai
--    pra legalizacao_documentos_historico (com o arquivo) em vez de ser
--    apagada. legalizacao_documentos continua sendo "a licença vigente",
--    uma por empresa+tipo, então quem já lia essa tabela não muda.
-- 3) Regras de vencimento por tipo + município: cada prefeitura tem a sua
--    (ex.: Vigilância no Rio vence sempre em 30/04; em Petrópolis, 12
--    meses depois da emissão). Regra sem município = padrão do tipo.
-- 4) Tipos novos de licença (conselho de classe separado em 3, bombeiros,
--    resíduos, ISS autônomo). Só valem para as empresas marcadas.

-- 1) Campos novos da licença ------------------------------------------------
alter table public.legalizacao_documentos
  add column if not exists numero text,
  add column if not exists orgao text,
  add column if not exists data_emissao date;

comment on column public.legalizacao_documentos.numero is 'Número da licença/alvará/protocolo do documento emitido.';
comment on column public.legalizacao_documentos.orgao is 'Órgão emissor (ex.: Vigilância Sanitária Municipal, CREMERJ, Prefeitura).';
comment on column public.legalizacao_documentos.data_emissao is 'Data de emissão — base da regra "meses após a emissão".';

-- 2) Histórico ---------------------------------------------------------------
create table if not exists public.legalizacao_documentos_historico (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tipo_id uuid not null references public.legalizacao_tipos_documento(id) on delete restrict,
  numero text,
  orgao text,
  data_emissao date,
  data_vencimento date,
  blob_url text not null,
  blob_pathname text not null,
  nome_arquivo text not null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  enviado_em timestamptz not null,          -- quando essa versão foi anexada
  substituido_em timestamptz not null default now(),
  substituido_por uuid references public.profiles(id) on delete set null
);

create index if not exists legalizacao_documentos_historico_empresa_tipo_idx
  on public.legalizacao_documentos_historico(company_id, tipo_id, substituido_em desc);

alter table public.legalizacao_documentos_historico enable row level security;

drop policy if exists legalizacao_documentos_historico_all on public.legalizacao_documentos_historico;
create policy legalizacao_documentos_historico_all on public.legalizacao_documentos_historico
  for all using ((select public.is_soma_staff()) or (select public.is_legalizacao_analista()))
  with check ((select public.is_soma_staff()) or (select public.is_legalizacao_analista()));

-- 3) Regras de vencimento ----------------------------------------------------
create table if not exists public.legalizacao_regras_vencimento (
  id uuid primary key default gen_random_uuid(),
  tipo_id uuid not null references public.legalizacao_tipos_documento(id) on delete cascade,
  municipality_ibge_code text check (municipality_ibge_code is null or municipality_ibge_code ~ '^\d{7}$'),
  municipality_name text,                    -- só pra exibir; a chave é o código
  state text,
  modo text not null check (modo in ('DATA_FIXA', 'MESES_APOS_EMISSAO', 'INDETERMINADO')),
  dia smallint check (dia between 1 and 31),
  mes smallint check (mes between 1 and 12),
  meses smallint check (meses between 1 and 120),
  antecedencia_dias smallint not null default 60 check (antecedencia_dias between 0 and 365),
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint legalizacao_regras_vencimento_campos check (
    (modo = 'DATA_FIXA' and dia is not null and mes is not null and meses is null)
    or (modo = 'MESES_APOS_EMISSAO' and meses is not null and dia is null and mes is null)
    or (modo = 'INDETERMINADO' and dia is null and mes is null and meses is null)
  )
);

-- Uma regra por tipo+município, e no máximo uma regra padrão (sem município) por tipo.
create unique index if not exists legalizacao_regras_vencimento_tipo_municipio_key
  on public.legalizacao_regras_vencimento(tipo_id, coalesce(municipality_ibge_code, ''));

drop trigger if exists legalizacao_regras_vencimento_set_updated_at on public.legalizacao_regras_vencimento;
create trigger legalizacao_regras_vencimento_set_updated_at before update on public.legalizacao_regras_vencimento
  for each row execute function public.set_updated_at();

alter table public.legalizacao_regras_vencimento enable row level security;

drop policy if exists legalizacao_regras_vencimento_all on public.legalizacao_regras_vencimento;
create policy legalizacao_regras_vencimento_all on public.legalizacao_regras_vencimento
  for all using ((select public.is_soma_staff()) or (select public.is_legalizacao_analista()))
  with check ((select public.is_soma_staff()) or (select public.is_legalizacao_analista()));

-- 4) Tipos novos -------------------------------------------------------------
-- aplica_a_todas = false: só contam pras empresas marcadas na tela do tipo.
insert into public.legalizacao_tipos_documento (nome, aplica_a_todas) values
  ('Conselho de Classe – Anuidade', false),
  ('Conselho de Classe – Certificado de Regularidade', false),
  ('Conselho de Classe – Responsável Técnico', false),
  ('Corpo de Bombeiros', false),
  ('COMDEP / PGRSS', false),
  ('MTR – INEA', false),
  ('ISS Autônomo', false)
on conflict (nome) do nothing;

-- Regras já conhecidas (informadas em 20/11/2026): Vigilância Sanitária no
-- Rio vence em 30/04; em Petrópolis, 12 meses após a última licença.
insert into public.legalizacao_regras_vencimento
  (tipo_id, municipality_ibge_code, municipality_name, state, modo, dia, mes, meses, antecedencia_dias)
select t.id, r.ibge, r.nome, 'RJ', r.modo, r.dia, r.mes, r.meses, 60
from public.legalizacao_tipos_documento t
cross join (values
  ('3304557', 'Rio de Janeiro', 'DATA_FIXA', 30::smallint, 4::smallint, null::smallint),
  ('3303906', 'Petrópolis', 'MESES_APOS_EMISSAO', null::smallint, null::smallint, 12::smallint)
) as r(ibge, nome, modo, dia, mes, meses)
where t.nome = 'Vigilância Sanitária'
on conflict do nothing;
