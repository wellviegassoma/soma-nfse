-- Módulo IRPF — Fase 1 (docs/irpf.md).
--
-- Base de contribuintes PRÓPRIA do IRPF, sem vínculo com companies: muitos
-- clientes de IRPF não têm nada a ver com as empresas atendidas, e o
-- Wellington não quer misturar as duas bases (23/11/2026).
--
-- Uma declaração por contribuinte × exercício; a versão mais recente
-- (original ou retificadora) fica no resumo, e todos os .DEC/.REC enviados
-- ficam em irpf_arquivos (Vercel Blob privado). O resumo é lido do .DEC pelo
-- lib/irpf/dec-parser.ts.
--
-- Dado sensível (CPF, bens, rendimentos): só equipe SOMA (is_soma_staff),
-- mesmo padrão do módulo de Tarefas.

create table if not exists public.irpf_contribuintes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf text not null unique check (cpf ~ '^\d{11}$'),
  nascimento date,
  email text,
  telefone text,
  responsavel_id uuid references public.profiles(id) on delete set null,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists irpf_contribuintes_nome_idx on public.irpf_contribuintes(nome);
create trigger irpf_contribuintes_set_updated_at before update on public.irpf_contribuintes
  for each row execute function public.set_updated_at();

create table if not exists public.irpf_declaracoes (
  id uuid primary key default gen_random_uuid(),
  contribuinte_id uuid not null references public.irpf_contribuintes(id) on delete cascade,
  exercicio int not null check (exercicio between 2000 and 2100),
  status text not null default 'NAO_INICIADA' check (status in (
    'NAO_INICIADA', 'AGUARDANDO_DOCUMENTOS', 'EM_ELABORACAO', 'EM_REVISAO',
    'AGUARDANDO_APROVACAO', 'APROVADA', 'TRANSMITIDA', 'NAO_FARA'
  )),
  responsavel_id uuid references public.profiles(id) on delete set null,
  revisor_id uuid references public.profiles(id) on delete set null,
  -- Resumo da última versão importada do .DEC (null = ainda sem arquivo).
  completa boolean,
  retificadora boolean not null default false,
  resultado text check (resultado in ('SEM_SALDO', 'PAGAR', 'RESTITUIR')),
  imposto_pagar numeric(14,2),
  imposto_restituir numeric(14,2),
  quotas int,
  numero_recibo text,
  transmitida_em timestamptz,
  resumo jsonb,
  resumo_atualizado_em timestamptz,
  -- Honorário: só controle, sem integração de cobrança.
  honorario_valor numeric(12,2),
  honorario_status text not null default 'A_COBRAR'
    check (honorario_status in ('A_COBRAR', 'COBRADO', 'PAGO', 'ISENTO')),
  aprovacao_enviada_em timestamptz,
  aprovada_em timestamptz,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contribuinte_id, exercicio)
);
create index if not exists irpf_declaracoes_exercicio_idx on public.irpf_declaracoes(exercicio, status);
create index if not exists irpf_declaracoes_responsavel_idx on public.irpf_declaracoes(responsavel_id, exercicio);
create trigger irpf_declaracoes_set_updated_at before update on public.irpf_declaracoes
  for each row execute function public.set_updated_at();

create table if not exists public.irpf_arquivos (
  id uuid primary key default gen_random_uuid(),
  declaracao_id uuid not null references public.irpf_declaracoes(id) on delete cascade,
  tipo text not null check (tipo in ('DEC', 'REC', 'DOCUMENTO')),
  -- Pathname no Blob nunca leva CPF nem nome (só ids aleatórios).
  blob_pathname text not null,
  nome_arquivo text not null,
  tamanho int,
  retificadora boolean,
  descricao text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists irpf_arquivos_declaracao_idx on public.irpf_arquivos(declaracao_id, created_at);

create table if not exists public.irpf_checklist_itens (
  id uuid primary key default gen_random_uuid(),
  declaracao_id uuid not null references public.irpf_declaracoes(id) on delete cascade,
  categoria text not null,
  descricao text not null,
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'RECEBIDO', 'NAO_SE_APLICA')),
  origem text not null default 'MANUAL' check (origem in ('PADRAO', 'ANO_ANTERIOR', 'MANUAL')),
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists irpf_checklist_itens_declaracao_idx on public.irpf_checklist_itens(declaracao_id, ordem);
create trigger irpf_checklist_itens_set_updated_at before update on public.irpf_checklist_itens
  for each row execute function public.set_updated_at();

create table if not exists public.irpf_eventos (
  id uuid primary key default gen_random_uuid(),
  declaracao_id uuid not null references public.irpf_declaracoes(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  tipo text not null, -- STATUS, IMPORTACAO, RESPONSAVEL, HONORARIO, APROVACAO, COMENTARIO
  de text,
  para text,
  comentario text,
  created_at timestamptz not null default now()
);
create index if not exists irpf_eventos_declaracao_idx on public.irpf_eventos(declaracao_id, created_at);

alter table public.irpf_contribuintes enable row level security;
alter table public.irpf_declaracoes enable row level security;
alter table public.irpf_arquivos enable row level security;
alter table public.irpf_checklist_itens enable row level security;
alter table public.irpf_eventos enable row level security;

drop policy if exists irpf_contribuintes_all on public.irpf_contribuintes;
create policy irpf_contribuintes_all on public.irpf_contribuintes
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
drop policy if exists irpf_declaracoes_all on public.irpf_declaracoes;
create policy irpf_declaracoes_all on public.irpf_declaracoes
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
drop policy if exists irpf_arquivos_all on public.irpf_arquivos;
create policy irpf_arquivos_all on public.irpf_arquivos
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
drop policy if exists irpf_checklist_itens_all on public.irpf_checklist_itens;
create policy irpf_checklist_itens_all on public.irpf_checklist_itens
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
drop policy if exists irpf_eventos_all on public.irpf_eventos;
create policy irpf_eventos_all on public.irpf_eventos
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
