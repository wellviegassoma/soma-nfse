-- Fase I — Sincronização diária de notas via distribuição por NSU (Sefin
-- Nacional /contribuintes/DFe/{nsu}) — puxa tanto notas de SAÍDA (empresa
-- é a prestadora) quanto de ENTRADA (empresa é a tomadora, recebeu de
-- fornecedor), pro fechamento contábil mensal. Motor confirmado contra
-- produção real em 19/08/2026 (correção decisiva: enviar cnpj_consulta
-- explícito, mesmo consultando com o certificado da própria empresa —
-- sem isso a API de distribuição recusa com 403, mesmo o certificado
-- sendo o correto).

alter table public.companies
  add column ultimo_nsu_distribuicao bigint not null default 0,
  add column ultima_sincronizacao_em timestamptz,
  add column ultima_sincronizacao_status text
    check (ultima_sincronizacao_status in ('sucesso', 'erro')),
  add column ultima_sincronizacao_erro text;

comment on column public.companies.ultimo_nsu_distribuicao is
  'Checkpoint da varredura por NSU — a próxima sincronização continua daqui em vez de escanear tudo de novo.';

create table public.notas_distribuidas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nsu bigint not null,
  chave_acesso text,
  direcao text not null check (direcao in ('saida', 'entrada', 'indefinida')),
  cancelada boolean not null default false,
  motivo_cancelamento text,
  numero text,
  data_emissao timestamptz,
  competencia date,
  bate_competencia boolean not null default true,
  prestador_cnpj text,
  prestador_nome text,
  tomador_cnpj text,
  tomador_nome text,
  descricao_servico text,
  local_incidencia text,
  codigo_trib_nacional text,
  codigo_nbs text,
  aliquota_issqn numeric(7, 4),
  valor_servico numeric(14, 2),
  valor_issqn numeric(14, 2),
  valor_pis numeric(14, 2),
  valor_cofins numeric(14, 2),
  valor_ret_cp numeric(14, 2),
  valor_ret_irrf numeric(14, 2),
  xml text not null,
  created_at timestamptz not null default now()
);

create index notas_distribuidas_company_id_idx on public.notas_distribuidas(company_id);
create index notas_distribuidas_competencia_idx on public.notas_distribuidas(company_id, competencia);
-- Evita duplicar a mesma nota em re-sincronizações — nem todo documento
-- tem chave_acesso (eventos, por exemplo, já são filtrados antes de
-- chegar aqui, mas por segurança a constraint só vale quando presente).
create unique index notas_distribuidas_company_chave_idx
  on public.notas_distribuidas(company_id, chave_acesso) where chave_acesso is not null;

alter table public.notas_distribuidas enable row level security;

-- Só leitura por usuário comum — a escrita é sempre via service role,
-- pela rotina de sincronização diária (mesmo padrão de audit_logs).
create policy notas_distribuidas_select on public.notas_distribuidas
  for select using (
    public.is_soma_staff() or public.user_company_role(company_id) is not null
  );
