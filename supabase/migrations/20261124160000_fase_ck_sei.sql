-- Fase CK — Módulo SEI (Legalização): espelho dos processos do SEI da
-- Prefeitura de Petrópolis em que a SOMA tem acesso externo. Quem alimenta é
-- a extensão "SOMA · SEI" rodando no Chrome logado no SEI (o servidor nunca
-- entra no SEI: login é gov.br/certificado ou senha+captcha). Spec: docs/sei.md.

create table if not exists public.sei_processos (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,                 -- ex.: PMP.000927/2026
  tipo text,                                   -- ex.: LICENÇA SANITÁRIA / INICIAL
  data_geracao date,
  nivel_acesso text,
  interessados text[] not null default '{}',
  -- Lido do primeiro documento (formulário/requerimento gerado no SEI).
  requerente_nome text,
  requerente_documento text check (requerente_documento is null or requerente_documento ~ '^\d{11}(\d{3})?$'),
  requerente_im text,
  company_id uuid references public.companies(id) on delete set null,
  vinculo_origem text check (vinculo_origem is null or vinculo_origem in
    ('MANUAL', 'FORMULARIO_DOC', 'FORMULARIO_IM', 'INTERESSADO', 'FORMULARIO_NOME')),
  acesso_validade date,
  acesso_expirado boolean not null default false,
  situacao text not null default 'EM_ANDAMENTO' check (situacao in
    ('EM_ANDAMENTO', 'EXIGENCIA', 'LICENCA_EMITIDA', 'CONCLUIDO')),
  ultimo_andamento_em timestamptz,
  ultimo_andamento_unidade text,
  ultimo_andamento_texto text,
  -- Andamento novo detectado numa sincronização (não conta a carga inicial).
  novidade_em timestamptz,
  visto_em timestamptz,
  visto_por uuid references public.profiles(id) on delete set null,
  sincronizado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sei_processos_company_idx on public.sei_processos (company_id);
create index if not exists sei_processos_ultimo_idx on public.sei_processos (ultimo_andamento_em desc);

create table if not exists public.sei_documentos (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.sei_processos(id) on delete cascade,
  numero_sei text not null,                    -- 7 dígitos, único no SEI
  ordem int not null default 0,
  tipo text,
  data date,
  unidade text,
  mime text,
  tamanho bigint,
  nome_arquivo text,
  blob_pathname text,
  baixado_em timestamptz,
  created_at timestamptz not null default now(),
  unique (processo_id, numero_sei)
);
create index if not exists sei_documentos_processo_idx on public.sei_documentos (processo_id, ordem);

create table if not exists public.sei_andamentos (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.sei_processos(id) on delete cascade,
  data_hora timestamptz not null,
  unidade text,
  descricao text not null,
  chave text not null,                         -- hash(data_hora|unidade|descricao) para não duplicar
  created_at timestamptz not null default now(),
  unique (processo_id, chave)
);
create index if not exists sei_andamentos_processo_idx on public.sei_andamentos (processo_id, data_hora desc);

create table if not exists public.sei_sincronizacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.profiles(id) on delete set null,
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz,
  processos int not null default 0,
  documentos_novos int not null default 0,
  andamentos_novos int not null default 0,
  erros jsonb not null default '[]',
  status text not null default 'EM_ANDAMENTO' check (status in ('EM_ANDAMENTO', 'OK', 'COM_ERROS', 'INTERROMPIDA'))
);

do $$
declare t text;
begin
  foreach t in array array['sei_processos', 'sei_documentos', 'sei_andamentos', 'sei_sincronizacoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select using ((select public.tem_permissao(''legalizacao.ver'')))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all using ((select public.tem_permissao(''legalizacao.editar''))) with check ((select public.tem_permissao(''legalizacao.editar'')))', t || '_write', t);
  end loop;
end $$;
