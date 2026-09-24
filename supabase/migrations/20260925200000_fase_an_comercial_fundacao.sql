-- Fase AN — Módulo Comercial / Onboarding de Clientes. Substitui o board do
-- Trello ("Onboarding – Novos Clientes | SOMA") usado hoje pelo time
-- comercial, com etapas e checklist editáveis pelo Super Admin em vez de
-- texto solto. Construído 100% sobre o sistema de permissões novo
-- (tem_permissao/usuario_permissoes) — sem função is_x_analista() nova. RLS
-- já nasce com o hoist `(select ...)` (lição do incidente de hoje com
-- notas_distribuidas, ver 20260925160000_fase_am_fix_performance_initplan.sql).

-- ---------------------------------------------------------------------------
-- Etapas do funil — editável pelo admin, "tipo" dirige comportamento sem
-- hardcode de nome.
-- ---------------------------------------------------------------------------
create table public.comercial_etapas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ordem int not null,
  cor text not null default '#64748b',
  tipo text not null default 'PIPELINE'
    check (tipo in ('PIPELINE', 'TERMINAL_GANHO', 'TERMINAL_PERDIDO', 'PARKING')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.comercial_etapas is
  'Colunas do quadro Kanban do módulo Comercial — nome/cor/ordem editáveis só por quem tem configuracoes.editar (Super Admin). "tipo" é o que dispara comportamento (ex.: TERMINAL_GANHO cria empresa), nunca o nome da etapa.';

create trigger comercial_etapas_set_updated_at before update on public.comercial_etapas
  for each row execute function public.set_updated_at();

-- Seed: as 11 listas reais do board (10 + "Dogma", parceiro avulso).
insert into public.comercial_etapas (nome, ordem, cor, tipo) values
  ('Novo Lead / Reunião', 10, '#94a3b8', 'PIPELINE'),
  ('Briefing e Diagnóstico Inicial', 20, '#38bdf8', 'PIPELINE'),
  ('Transição Contábil (já tem CNPJ)', 30, '#a78bfa', 'PIPELINE'),
  ('Abertura / Legalização (CNPJ novo)', 40, '#f59e0b', 'PIPELINE'),
  ('Formalização e Procurações', 50, '#fb923c', 'PIPELINE'),
  ('Implantação Sistema', 60, '#22d3ee', 'PIPELINE'),
  ('Primeiro Fechamento', 70, '#60a5fa', 'PIPELINE'),
  ('Cliente Ativo', 80, '#22c55e', 'TERMINAL_GANHO'),
  ('Stand By', 90, '#a3a3a3', 'PARKING'),
  ('Não Fechado / Revisitar', 100, '#ef4444', 'TERMINAL_PERDIDO'),
  ('Dogma', 110, '#eab308', 'PIPELINE');

-- ---------------------------------------------------------------------------
-- Prospects
-- ---------------------------------------------------------------------------
create table public.comercial_prospects (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo_onboarding text check (tipo_onboarding in ('TRANSICAO_CONTABIL', 'ABERTURA_NOVO_CNPJ')),
  pessoa_tipo text check (pessoa_tipo in ('PF', 'PJ')),
  especialidade text,
  regime_tributario text,
  faturamento_medio_estimado numeric(14,2),
  cnpj text,
  cpf text,
  honorario_soma numeric(14,2),
  descricao text,
  etapa_id uuid not null references public.comercial_etapas(id) on delete restrict,
  responsavel_id uuid references public.profiles(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.comercial_prospects is
  'Um prospect por card do Trello antigo. company_id só é preenchido quando o prospect vira Cliente Ativo (ver confirmarClienteAtivo) — nunca antes disso.';

create index comercial_prospects_etapa_idx on public.comercial_prospects(etapa_id);
create index comercial_prospects_responsavel_idx on public.comercial_prospects(responsavel_id);
create index comercial_prospects_company_idx on public.comercial_prospects(company_id);

create trigger comercial_prospects_set_updated_at before update on public.comercial_prospects
  for each row execute function public.set_updated_at();

-- Auditoria de movimentação entre etapas — mesmo espírito de
-- atendimento_transferencias, mas comentário opcional (Trello não obriga
-- comentário pra mover card).
create table public.comercial_prospect_historico (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.comercial_prospects(id) on delete cascade,
  de_etapa_id uuid references public.comercial_etapas(id) on delete set null,
  para_etapa_id uuid not null references public.comercial_etapas(id) on delete restrict,
  de_responsavel_id uuid references public.profiles(id) on delete set null,
  para_responsavel_id uuid references public.profiles(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  comentario text,
  created_at timestamptz not null default now()
);
create index comercial_prospect_historico_prospect_idx on public.comercial_prospect_historico(prospect_id);

-- ---------------------------------------------------------------------------
-- Template do checklist — editável pelo admin.
-- ---------------------------------------------------------------------------
create table public.comercial_checklist_categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ordem int not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger comercial_checklist_categorias_set_updated_at before update on public.comercial_checklist_categorias
  for each row execute function public.set_updated_at();

create table public.comercial_checklist_itens_template (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references public.comercial_checklist_categorias(id) on delete cascade,
  descricao text not null,
  ordem int not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index comercial_checklist_itens_template_categoria_idx on public.comercial_checklist_itens_template(categoria_id);
create trigger comercial_checklist_itens_template_set_updated_at before update on public.comercial_checklist_itens_template
  for each row execute function public.set_updated_at();

-- Seed: as 6 categorias e os 72 itens do card "Template" real do Trello
-- (conferido item a item — não é aproximação).
do $$
declare
  v_briefing uuid;
  v_legalizacao uuid;
  v_dp uuid;
  v_fiscal uuid;
  v_contabilidade uuid;
  v_implementacao uuid;
begin
  insert into public.comercial_checklist_categorias (nome, ordem) values ('Briefing', 10) returning id into v_briefing;
  insert into public.comercial_checklist_categorias (nome, ordem) values ('Legalização e Acessos', 20) returning id into v_legalizacao;
  insert into public.comercial_checklist_categorias (nome, ordem) values ('DP', 30) returning id into v_dp;
  insert into public.comercial_checklist_categorias (nome, ordem) values ('Fiscal', 40) returning id into v_fiscal;
  insert into public.comercial_checklist_categorias (nome, ordem) values ('Contabilidade', 50) returning id into v_contabilidade;
  insert into public.comercial_checklist_categorias (nome, ordem) values ('Implementação dos Sistemas', 60) returning id into v_implementacao;

  insert into public.comercial_checklist_itens_template (categoria_id, descricao, ordem) values
    (v_briefing, 'Reunião Realizada', 10),
    (v_briefing, 'Faz ou vai fazer livro caixa', 20),
    (v_briefing, 'Tipo do caso definido: (Novo CNPJ / PF para PJ / Só troca de contabilidade)', 30),
    (v_briefing, 'Regime Tributário Identificado', 40),
    (v_briefing, 'Especialidade e Cidade', 50),
    (v_briefing, 'Faturamento médio estimado', 60),
    (v_briefing, 'Despesas médias identificadas (Fator R e Livro Caixa)', 70),
    (v_briefing, 'Possui Convênios? (sim/não)', 80),
    (v_briefing, 'Possui Funcionários? (Sim/Não)', 90),
    (v_briefing, 'Próximo Passo definido', 100),
    (v_briefing, 'Valor de Honorários definido e apresentado', 110),
    (v_briefing, 'Solicitação formal enviada ao contador anterior', 120),
    (v_briefing, 'Data de corte/alinhamento definida', 130),
    (v_briefing, 'Contrato de Prestação de Serviço - ASSINADO', 140),
    (v_briefing, 'Criação do Grupo no WhatsApp', 150),
    (v_briefing, 'Comunicação no Grupo SOMA - Para a Equipe', 160);

  insert into public.comercial_checklist_itens_template (categoria_id, descricao, ordem) values
    (v_legalizacao, 'Contrato Social', 10),
    (v_legalizacao, 'Alterações Contratuais', 20),
    (v_legalizacao, 'Alvará de Funcionamento', 30),
    (v_legalizacao, 'Licença Sanitária', 40),
    (v_legalizacao, 'CNES', 50),
    (v_legalizacao, 'Certificado Corpo de Bombeiros', 60),
    (v_legalizacao, 'Documentos dos Sócios', 70),
    (v_legalizacao, 'Certificado Digital CNPJ e/ou CPF', 80),
    (v_legalizacao, 'Código de Acesso Gov.br', 90),
    (v_legalizacao, 'Login e Senha de Acesso ao Seguro-Desemprego', 100),
    (v_legalizacao, 'Login e senha de Acesso ao Site Vale Transporte', 110),
    (v_legalizacao, 'Login e senha de Acesso ao site Vale Refeição/Alimentação/Combustível', 120);

  insert into public.comercial_checklist_itens_template (categoria_id, descricao, ordem) values
    (v_dp, 'Número NIT/PIS dos sócios', 10),
    (v_dp, 'Último Pró-labore calculado do sócio', 20),
    (v_dp, 'Folhas de pagamentos e resumos (últimos meses)', 30),
    (v_dp, 'Fichas de Registro de todos os funcionários (Ativos e Demitidos)', 40),
    (v_dp, 'Relação de Dependentes para IR e Salário Família', 50),
    (v_dp, 'Relação dos valores diários de passagem por funcionário', 60),
    (v_dp, 'Controle de férias com vencimento atualizado', 70),
    (v_dp, 'Último recibo de férias dos funcionários', 80),
    (v_dp, 'Relação de afastamentos e atestados', 90),
    (v_dp, 'Relação de Pensão Alimentícia e os ofícios', 100),
    (v_dp, 'Relação de todos os demitidos', 110),
    (v_dp, 'Rescisões de contrato últimos meses', 120),
    (v_dp, 'Relação de funcionários cumprindo aviso prévio', 130),
    (v_dp, 'Relação de valores pagos como adiantamento, gratificações, prêmios, etc.', 140),
    (v_dp, 'Última Convenção Coletiva utilizada', 150),
    (v_dp, 'Relação de empréstimos consignados', 160),
    (v_dp, 'Relação de parcelamentos de dívidas trabalhistas', 170),
    (v_dp, 'Relação de funcionários em contrato de experiência', 180),
    (v_dp, 'Processos trabalhistas e seus ofícios', 190);

  insert into public.comercial_checklist_itens_template (categoria_id, descricao, ordem) values
    (v_fiscal, 'Acesso sistema da Nota Fiscal', 10);

  insert into public.comercial_checklist_itens_template (categoria_id, descricao, ordem) values
    (v_contabilidade, 'Balanço ano anterior', 10),
    (v_contabilidade, 'DRE ano anterior', 20),
    (v_contabilidade, 'Balancete período', 30),
    (v_contabilidade, 'Razão das contas', 40),
    (v_contabilidade, 'Conciliação bancária', 50),
    (v_contabilidade, 'Conciliação clientes e fornecedores', 60),
    (v_contabilidade, 'Controle de ativo imobilizado e depreciações', 70),
    (v_contabilidade, 'Última ECD', 80),
    (v_contabilidade, 'Última ECF', 90),
    (v_contabilidade, 'Última DEFIS', 100),
    (v_contabilidade, 'Última Nota Explicativa', 110);

  insert into public.comercial_checklist_itens_template (categoria_id, descricao, ordem) values
    (v_implementacao, 'Cadastrar no CIC SOMA', 10),
    (v_implementacao, 'Cadastrar NIBO', 20),
    (v_implementacao, 'Cadastrar Monitor Contábil', 30),
    (v_implementacao, 'Cliente cadastrado no sistema contábil/fiscal', 40),
    (v_implementacao, 'Cadastrar NFStock', 50),
    (v_implementacao, 'Definição dos responsáveis por setor', 60),
    (v_implementacao, 'Regime confirmado no sistema', 70),
    (v_implementacao, 'Parametrização de impostos conferida', 80),
    (v_implementacao, 'Parametrização de retenções conferida', 90),
    (v_implementacao, 'Plano de contas aplicado', 100),
    (v_implementacao, 'Sócios cadastrados', 110),
    (v_implementacao, 'Pró-labore definido/configurado', 120),
    (v_implementacao, 'Folha configurada (se houver)', 130);
end $$;

-- ---------------------------------------------------------------------------
-- Checklist por prospect — SNAPSHOT (texto copiado, sem FK pro template).
-- Revisar o template depois nunca altera silenciosamente um prospect em
-- andamento.
-- ---------------------------------------------------------------------------
create table public.comercial_prospect_checklist (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.comercial_prospects(id) on delete cascade,
  categoria_nome text not null,
  categoria_ordem int not null,
  item_descricao text not null,
  item_ordem int not null,
  concluido boolean not null default false,
  concluido_por uuid references public.profiles(id) on delete set null,
  concluido_em timestamptz,
  created_at timestamptz not null default now()
);
create index comercial_prospect_checklist_prospect_idx on public.comercial_prospect_checklist(prospect_id);

-- Linha do tempo unificada (comentário humano + eventos do sistema), igual
-- ao "Comentários e atividade" que já existe no Trello.
create table public.comercial_prospect_atividade (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.comercial_prospects(id) on delete cascade,
  tipo text not null check (tipo in ('COMENTARIO', 'MUDANCA_ETAPA', 'CHECKLIST_ITEM', 'SISTEMA')),
  autor_id uuid references public.profiles(id) on delete set null,
  corpo text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index comercial_prospect_atividade_prospect_idx on public.comercial_prospect_atividade(prospect_id);

-- Anexos — mesmo formato de legalizacao_documentos (Vercel Blob), mas lista
-- (insert-only), não upsert-um-por-tipo.
create table public.comercial_prospect_anexos (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.comercial_prospects(id) on delete cascade,
  blob_url text not null,
  blob_pathname text not null,
  nome_arquivo text not null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index comercial_prospect_anexos_prospect_idx on public.comercial_prospect_anexos(prospect_id);

-- ---------------------------------------------------------------------------
-- Catálogo de permissões
-- ---------------------------------------------------------------------------
insert into public.permissoes_catalogo (chave, modulo, escopo, irreversivel, ordem) values
  ('comercial.ver', 'comercial', 'GLOBAL', false, 170),
  ('comercial.editar', 'comercial', 'GLOBAL', false, 171);

-- ---------------------------------------------------------------------------
-- RLS — módulo 100% global, nenhuma dimensão de company_id nas policies.
-- Hoist `(select ...)` desde a criação (as tabelas de histórico/atividade
-- crescem uma linha por movimentação/comentário/item de checklist).
-- ---------------------------------------------------------------------------
alter table public.comercial_etapas enable row level security;
create policy comercial_etapas_select on public.comercial_etapas
  for select using ((select public.tem_permissao('comercial.ver')));
create policy comercial_etapas_write on public.comercial_etapas
  for insert with check ((select public.tem_permissao('configuracoes.editar')));
create policy comercial_etapas_update on public.comercial_etapas
  for update using ((select public.tem_permissao('configuracoes.editar')))
  with check ((select public.tem_permissao('configuracoes.editar')));
create policy comercial_etapas_delete on public.comercial_etapas
  for delete using ((select public.tem_permissao('configuracoes.editar')));

alter table public.comercial_checklist_categorias enable row level security;
create policy comercial_checklist_categorias_select on public.comercial_checklist_categorias
  for select using ((select public.tem_permissao('comercial.ver')));
create policy comercial_checklist_categorias_write on public.comercial_checklist_categorias
  for all using ((select public.tem_permissao('configuracoes.editar')))
  with check ((select public.tem_permissao('configuracoes.editar')));

alter table public.comercial_checklist_itens_template enable row level security;
create policy comercial_checklist_itens_template_select on public.comercial_checklist_itens_template
  for select using ((select public.tem_permissao('comercial.ver')));
create policy comercial_checklist_itens_template_write on public.comercial_checklist_itens_template
  for all using ((select public.tem_permissao('configuracoes.editar')))
  with check ((select public.tem_permissao('configuracoes.editar')));

alter table public.comercial_prospects enable row level security;
create policy comercial_prospects_select on public.comercial_prospects
  for select using ((select public.tem_permissao('comercial.ver')));
create policy comercial_prospects_write on public.comercial_prospects
  for all using ((select public.tem_permissao('comercial.editar')))
  with check ((select public.tem_permissao('comercial.editar')));

alter table public.comercial_prospect_historico enable row level security;
create policy comercial_prospect_historico_all on public.comercial_prospect_historico
  for all using ((select public.tem_permissao('comercial.editar')))
  with check ((select public.tem_permissao('comercial.editar')));

alter table public.comercial_prospect_checklist enable row level security;
create policy comercial_prospect_checklist_all on public.comercial_prospect_checklist
  for all using ((select public.tem_permissao('comercial.editar')))
  with check ((select public.tem_permissao('comercial.editar')));

alter table public.comercial_prospect_atividade enable row level security;
create policy comercial_prospect_atividade_all on public.comercial_prospect_atividade
  for all using ((select public.tem_permissao('comercial.editar')))
  with check ((select public.tem_permissao('comercial.editar')));

alter table public.comercial_prospect_anexos enable row level security;
create policy comercial_prospect_anexos_all on public.comercial_prospect_anexos
  for all using ((select public.tem_permissao('comercial.editar')))
  with check ((select public.tem_permissao('comercial.editar')));
