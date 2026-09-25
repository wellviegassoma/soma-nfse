-- Legalização > Processos (Abertura, Alteração Contratual, Encerramento) —
-- recria dentro do soma-nfse o controle hoje feito no eLegalize (Alterdata).
-- Ver plano completo em C:\Users\Wellington Viegas\.claude\plans\drifting-noodling-pnueli.md

-- Fluxos (cabeçalho do template) — editável por quem tem legalizacao.editar.
create table public.legalizacao_fluxos (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  nome text not null unique,
  tipo_processo text not null check (tipo_processo in ('ABERTURA', 'ALTERACAO', 'ENCERRAMENTO')),
  prazo_padrao_dias int check (prazo_padrao_dias is null or prazo_padrao_dias > 0),
  ordem int not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger legalizacao_fluxos_set_updated_at before update on public.legalizacao_fluxos
  for each row execute function public.set_updated_at();

-- Template de fases por fluxo.
create table public.legalizacao_fluxo_fases_template (
  id uuid primary key default gen_random_uuid(),
  fluxo_id uuid not null references public.legalizacao_fluxos(id) on delete cascade,
  nome text not null,
  ordem int not null,
  descricao text,
  acao text check (acao in ('CRIAR_EMPRESA')),  -- só faz sentido em fluxo ABERTURA
  tipo_documento_id uuid references public.legalizacao_tipos_documento(id) on delete set null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fluxo_id, nome)
);
create index legalizacao_fluxo_fases_template_fluxo_idx on public.legalizacao_fluxo_fases_template(fluxo_id, ordem);
create unique index legalizacao_fluxo_fases_template_uma_criar_empresa
  on public.legalizacao_fluxo_fases_template(fluxo_id) where acao = 'CRIAR_EMPRESA' and ativo;
create trigger legalizacao_fluxo_fases_template_set_updated_at before update on public.legalizacao_fluxo_fases_template
  for each row execute function public.set_updated_at();

-- Seed: fases reais do eLegalize (conferidas na conta real, ordem exata).
do $$
declare
  v_abertura uuid; v_alteracao uuid; v_encerramento uuid;
begin
  insert into public.legalizacao_fluxos (chave, nome, tipo_processo, ordem) values
    ('ABERTURA_EMPRESA', 'Abertura de Empresa', 'ABERTURA', 10) returning id into v_abertura;
  insert into public.legalizacao_fluxos (chave, nome, tipo_processo, ordem) values
    ('ALTERACAO_CONTRATUAL', 'Alteração Contratual', 'ALTERACAO', 20) returning id into v_alteracao;
  insert into public.legalizacao_fluxos (chave, nome, tipo_processo, ordem) values
    ('ENCERRAMENTO_EMPRESA', 'Encerramento de Empresa', 'ENCERRAMENTO', 30) returning id into v_encerramento;

  insert into public.legalizacao_fluxo_fases_template (fluxo_id, nome, ordem, acao) values
    (v_abertura, 'Documentos Solicitados', 10, null),
    (v_abertura, 'Documentos Recebidos', 20, null),
    (v_abertura, 'Minuta Feita', 30, null),
    (v_abertura, 'Minuta Aprovada', 40, null),
    (v_abertura, 'Consulta Prévia / Viabilidade', 50, null),
    (v_abertura, 'DBE', 60, null),
    (v_abertura, 'Contrato / Enquadramento / Procurações assinadas', 70, null),
    (v_abertura, 'Protocolo Processo', 80, null),
    (v_abertura, 'Protocolo Deferido', 90, null),
    (v_abertura, 'Assinatura do Gov para CNPJ', 100, null),
    (v_abertura, 'Certificado Digital', 110, null),
    (v_abertura, 'CRIAR PROCESSOS DE CADASTRO', 120, 'CRIAR_EMPRESA');

  insert into public.legalizacao_fluxo_fases_template (fluxo_id, nome, ordem) values
    (v_alteracao, 'Documentos Solicitados', 10), (v_alteracao, 'Documentos Recebidos', 20),
    (v_alteracao, 'Minuta Feita', 30), (v_alteracao, 'Minuta Aprovada', 40),
    (v_alteracao, 'Consulta Prévia / Viabilidade', 50), (v_alteracao, 'DBE', 60),
    (v_alteracao, 'Contrato / Enquadramento / Procurações assinadas', 70),
    (v_alteracao, 'Protocolo Processo', 80), (v_alteracao, 'Protocolo Deferido', 90),
    (v_alteracao, 'Assinatura do Gov para CNPJ', 100), (v_alteracao, 'Certificado Digital', 110),
    (v_alteracao, 'CRIAR PROCESSOS DE CADASTRO', 120),
    (v_alteracao, 'Contrato de Prestação de Serviços com a SOMA', 130),
    (v_alteracao, 'Corpo de Bombeiros', 140), (v_alteracao, 'Alvará de Funcionamento', 150),
    (v_alteracao, 'Vigilância Sanitária', 160), (v_alteracao, 'Conselho de Classe', 170),
    (v_alteracao, 'CNES', 180);

  insert into public.legalizacao_fluxo_fases_template (fluxo_id, nome, ordem) values
    (v_encerramento, 'Minuta Feita', 10), (v_encerramento, 'Minuta Aprovada', 20),
    (v_encerramento, 'DBE', 30), (v_encerramento, 'Distrato do Contrato assinado', 40),
    (v_encerramento, 'Protocolo Processo', 50), (v_encerramento, 'Protocolo Deferido', 60),
    (v_encerramento, 'Assinatura do Gov para CNPJ', 70), (v_encerramento, 'CRIAR PROCESSOS DE CADASTRO', 80),
    (v_encerramento, 'Baixa Inscrição Municipal', 90), (v_encerramento, 'Baixa Conselho de Classe', 100);
end $$;

-- Processo ("negócio"). origem_externa/origem_externa_id existem desde já
-- pra suportar a importação futura dos ~30 processos reais do eLegalize
-- (idempotência: um mesmo processo importado 2x não duplica).
create table public.legalizacao_processos (
  id uuid primary key default gen_random_uuid(),
  tipo_processo text not null check (tipo_processo in ('ABERTURA', 'ALTERACAO', 'ENCERRAMENTO')),
  fluxo_id uuid not null references public.legalizacao_fluxos(id) on delete restrict,
  fluxo_nome text not null,
  nome text not null,
  company_id uuid references public.companies(id) on delete cascade,
  cnpj text check (cnpj is null or cnpj ~ '^\d{14}$'),
  data_inicio date not null,
  prazo_final date,
  data_conclusao date,
  responsavel_id uuid references public.profiles(id) on delete set null,
  detalhes text,
  contato_nome text,
  contato_email text,
  contato_whatsapp text,
  alteracao_itens text[] not null default '{}',
  arquivado_em timestamptz,
  motivo_arquivamento text,
  origem_externa text check (origem_externa is null or origem_externa in ('ELEGALIZE')),
  origem_externa_id text,
  criado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint legalizacao_processos_empresa_obrigatoria check (tipo_processo = 'ABERTURA' or company_id is not null),
  constraint legalizacao_processos_cnpj_so_abertura check (tipo_processo = 'ABERTURA' or cnpj is null),
  constraint legalizacao_processos_prazo_valido check (prazo_final is null or prazo_final >= data_inicio),
  constraint legalizacao_processos_alteracao_itens_validos check (
    alteracao_itens <@ array['SOCIOS','CESSAO_COTAS','ADMINISTRACAO','DENOMINACAO','ATIVIDADE','ENDERECO','CAPITAL_SOCIAL','OUTRO']::text[]
  ),
  constraint legalizacao_processos_alteracao_itens_so_alteracao check (tipo_processo = 'ALTERACAO' or cardinality(alteracao_itens) = 0)
);
create index legalizacao_processos_company_idx on public.legalizacao_processos(company_id);
create index legalizacao_processos_responsavel_idx on public.legalizacao_processos(responsavel_id);
create index legalizacao_processos_fluxo_idx on public.legalizacao_processos(fluxo_id);
create index legalizacao_processos_arquivado_idx on public.legalizacao_processos(arquivado_em);
create index legalizacao_processos_conclusao_idx on public.legalizacao_processos(data_conclusao);
create index legalizacao_processos_prazo_idx on public.legalizacao_processos(prazo_final);
create unique index legalizacao_processos_um_encerramento_aberto
  on public.legalizacao_processos(company_id) where tipo_processo = 'ENCERRAMENTO' and data_conclusao is null and arquivado_em is null;
create unique index legalizacao_processos_origem_externa_idx
  on public.legalizacao_processos(origem_externa, origem_externa_id) where origem_externa is not null;
create trigger legalizacao_processos_set_updated_at before update on public.legalizacao_processos
  for each row execute function public.set_updated_at();

-- Fases por processo — SNAPSHOT (sem FK pro template).
create table public.legalizacao_processo_fases (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.legalizacao_processos(id) on delete cascade,
  nome text not null,
  ordem int not null,
  descricao text,
  acao text check (acao in ('CRIAR_EMPRESA')),
  tipo_documento_id uuid references public.legalizacao_tipos_documento(id) on delete set null,
  responsavel_id uuid references public.profiles(id) on delete set null,
  prazo date,  -- opcional; null = usa prazo_final do processo
  status_manual text check (status_manual in ('AGUARDANDO_DADOS', 'A_CONFERIR', 'PARALISADO')),
  data_conclusao date,
  concluido_em timestamptz,
  concluido_por uuid references public.profiles(id) on delete set null,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint legalizacao_processo_fases_conclusao_consistente check ((data_conclusao is null) = (concluido_em is null)),
  constraint legalizacao_processo_fases_concluida_sem_override check (data_conclusao is null or status_manual is null)
);
create index legalizacao_processo_fases_processo_idx on public.legalizacao_processo_fases(processo_id, ordem);
create trigger legalizacao_processo_fases_set_updated_at before update on public.legalizacao_processo_fases
  for each row execute function public.set_updated_at();

-- data_conclusao do processo = maior data_conclusao das fases quando TODAS concluídas; senão null.
create or replace function public.legalizacao_recalcular_conclusao_processo()
returns trigger language plpgsql set search_path = public as $$
declare v_processo uuid := coalesce(new.processo_id, old.processo_id);
begin
  update public.legalizacao_processos p set data_conclusao = sub.data_final
    from (select case when count(*) > 0 and count(*) = count(f.data_conclusao) then max(f.data_conclusao) end as data_final
            from public.legalizacao_processo_fases f where f.processo_id = v_processo) sub
   where p.id = v_processo and p.data_conclusao is distinct from sub.data_final;
  return null;
end; $$;
create trigger legalizacao_processo_fases_recalcular_conclusao
  after insert or delete or update of data_conclusao on public.legalizacao_processo_fases
  for each row execute function public.legalizacao_recalcular_conclusao_processo();

-- Histórico estruturado (append-only).
create table public.legalizacao_processo_historico (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.legalizacao_processos(id) on delete cascade,
  fase_id uuid references public.legalizacao_processo_fases(id) on delete set null,
  fase_nome text,
  campo text not null check (campo in (
    'STATUS_FASE','RESPONSAVEL_FASE','PRAZO_FASE','FASE_ADICIONADA','FASE_REMOVIDA',
    'RESPONSAVEL_PROCESSO','PRAZO_FINAL','EMPRESA_VINCULADA','ARQUIVAMENTO'
  )),
  de_valor text, para_valor text,
  user_id uuid references public.profiles(id) on delete set null,
  comentario text,
  created_at timestamptz not null default now()
);
create index legalizacao_processo_historico_processo_idx on public.legalizacao_processo_historico(processo_id, created_at);

-- Linha do tempo (comentário + eventos).
create table public.legalizacao_processo_atividade (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.legalizacao_processos(id) on delete cascade,
  fase_id uuid references public.legalizacao_processo_fases(id) on delete set null,
  tipo text not null check (tipo in ('COMENTARIO','STATUS_FASE','ALTERACAO_PROCESSO','ANEXO','SISTEMA')),
  autor_id uuid references public.profiles(id) on delete set null,
  corpo text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index legalizacao_processo_atividade_processo_idx on public.legalizacao_processo_atividade(processo_id, created_at);

-- Anexos (Vercel Blob privado, insert-only, opcionalmente presos a uma fase).
create table public.legalizacao_processo_anexos (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.legalizacao_processos(id) on delete cascade,
  fase_id uuid references public.legalizacao_processo_fases(id) on delete set null,
  blob_url text not null,
  blob_pathname text not null,
  nome_arquivo text not null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index legalizacao_processo_anexos_processo_idx on public.legalizacao_processo_anexos(processo_id);

-- Lista de responsáveis — profiles_select só deixa is_soma_staff ler outros
-- perfis; um analista só-legalização veria dropdown vazio sem isto.
create or replace function public.legalizacao_responsaveis()
returns table (id uuid, full_name text)
language sql security definer set search_path = public stable as $$
  select p.id, p.full_name from public.profiles p
   where public.tem_permissao('legalizacao.ver') and p.ativo
     and exists (select 1 from public.usuario_permissoes up
                  where up.user_id = p.id and up.permissao = 'legalizacao.editar' and up.company_id is null)
   order by p.full_name;
$$;
revoke all on function public.legalizacao_responsaveis() from public;
grant execute on function public.legalizacao_responsaveis() to authenticated;

-- RLS — hoist desde o dia 1; ver lê, editar escreve (separado, não "for all"
-- como o Comercial — aqui quem só tem .ver ainda precisa ler histórico/atividade).
alter table public.legalizacao_fluxos enable row level security;
create policy legalizacao_fluxos_select on public.legalizacao_fluxos for select using ((select public.tem_permissao('legalizacao.ver')));
create policy legalizacao_fluxos_write on public.legalizacao_fluxos for all
  using ((select public.tem_permissao('legalizacao.editar'))) with check ((select public.tem_permissao('legalizacao.editar')));

alter table public.legalizacao_fluxo_fases_template enable row level security;
create policy legalizacao_fluxo_fases_template_select on public.legalizacao_fluxo_fases_template for select using ((select public.tem_permissao('legalizacao.ver')));
create policy legalizacao_fluxo_fases_template_write on public.legalizacao_fluxo_fases_template for all
  using ((select public.tem_permissao('legalizacao.editar'))) with check ((select public.tem_permissao('legalizacao.editar')));

alter table public.legalizacao_processos enable row level security;
create policy legalizacao_processos_select on public.legalizacao_processos for select using ((select public.tem_permissao('legalizacao.ver')));
create policy legalizacao_processos_insert on public.legalizacao_processos for insert with check ((select public.tem_permissao('legalizacao.editar')));
create policy legalizacao_processos_update on public.legalizacao_processos for update
  using ((select public.tem_permissao('legalizacao.editar'))) with check ((select public.tem_permissao('legalizacao.editar')));
create policy legalizacao_processos_delete on public.legalizacao_processos for delete using ((select public.tem_permissao('legalizacao.editar')));

alter table public.legalizacao_processo_fases enable row level security;
create policy legalizacao_processo_fases_select on public.legalizacao_processo_fases for select using ((select public.tem_permissao('legalizacao.ver')));
create policy legalizacao_processo_fases_insert on public.legalizacao_processo_fases for insert with check ((select public.tem_permissao('legalizacao.editar')));
create policy legalizacao_processo_fases_update on public.legalizacao_processo_fases for update
  using ((select public.tem_permissao('legalizacao.editar'))) with check ((select public.tem_permissao('legalizacao.editar')));
create policy legalizacao_processo_fases_delete on public.legalizacao_processo_fases for delete using ((select public.tem_permissao('legalizacao.editar')));

alter table public.legalizacao_processo_historico enable row level security;
create policy legalizacao_processo_historico_select on public.legalizacao_processo_historico for select using ((select public.tem_permissao('legalizacao.ver')));
create policy legalizacao_processo_historico_insert on public.legalizacao_processo_historico for insert with check ((select public.tem_permissao('legalizacao.editar')));

alter table public.legalizacao_processo_atividade enable row level security;
create policy legalizacao_processo_atividade_select on public.legalizacao_processo_atividade for select using ((select public.tem_permissao('legalizacao.ver')));
create policy legalizacao_processo_atividade_insert on public.legalizacao_processo_atividade for insert with check ((select public.tem_permissao('legalizacao.editar')));

alter table public.legalizacao_processo_anexos enable row level security;
create policy legalizacao_processo_anexos_select on public.legalizacao_processo_anexos for select using ((select public.tem_permissao('legalizacao.ver')));
create policy legalizacao_processo_anexos_insert on public.legalizacao_processo_anexos for insert with check ((select public.tem_permissao('legalizacao.editar')));
create policy legalizacao_processo_anexos_delete on public.legalizacao_processo_anexos for delete using ((select public.tem_permissao('legalizacao.editar')));
