-- Fase CC: módulo de Tarefas — Fase 1 (aprovado em 23/11/2026; desenho em docs/tarefas.md §6).
--
-- Rotina do mês da equipe: um MODELO diz o quê, de qual departamento, para
-- quais empresas e com qual prazo; a geração diária cria uma TAREFA por
-- empresa × modelo × competência, com o responsável da CARTEIRA.
--
-- Prazo:
--   AGENDA   → prazo legal = vencimento da obrigação na Agenda Tributária
--              importada (mês = competência + mes_prazo_offset); meta = meta
--              SOMA da obrigação (Configurações) ou dia_meta do modelo.
--   DIA_FIXO → prazo legal = dia_prazo do mês (competência + offset);
--              meta = dia_meta do modelo, se houver.
-- "Atrasada" (passou da meta) e "Risco de multa" (passou do prazo legal) não
-- são gravados: a tela calcula, para nunca ficarem desatualizados.

create table if not exists public.tarefa_modelos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  departamento_id uuid not null references public.atendimento_departamentos(id) on delete restrict,
  periodicidade text not null default 'MENSAL' check (periodicidade in ('MENSAL', 'TRIMESTRAL', 'ANUAL')),
  -- meses da competência em que gera (1–12). MENSAL ignora; TRIMESTRAL
  -- padrão {3,6,9,12}; ANUAL padrão {12}.
  meses int[],
  prazo_tipo text not null check (prazo_tipo in ('AGENDA', 'DIA_FIXO')),
  -- AGENDA: chave da obrigação (lib/agenda-tributaria.ts chaveObrigacao) ou
  -- um prefixo dela (ex.: "DECLARACAO:pgdas-d"), para resistir a pequenas
  -- mudanças de redação da Receita.
  agenda_chave text,
  dia_prazo int check (dia_prazo between 1 and 31),
  dia_meta int check (dia_meta between 1 and 31),
  mes_prazo_offset int not null default 1 check (mes_prazo_offset between 0 and 12),
  -- A quem se aplica (null = sem filtro).
  aplica_regimes text[],          -- SIMPLES_NACIONAL, LUCRO_PRESUMIDO, LUCRO_REAL, IMUNE_ISENTO
  aplica_pessoa text check (aplica_pessoa in ('PF', 'PJ')),
  aplica_municipios text[],       -- códigos IBGE
  aplica_folha boolean,           -- true = só quem tem folha nos últimos 3 meses (folha_mensal)
  ativo boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tarefa_modelos_prazo_ck check (
    (prazo_tipo = 'AGENDA' and agenda_chave is not null)
    or (prazo_tipo = 'DIA_FIXO' and dia_prazo is not null)
  )
);
create trigger tarefa_modelos_set_updated_at before update on public.tarefa_modelos
  for each row execute function public.set_updated_at();

-- Exceções por empresa: força incluir (ex.: tem folha mas não foi importada)
-- ou excluir (ex.: empresa que o filtro pega mas a SOMA não faz).
create table if not exists public.tarefa_modelo_excecoes (
  modelo_id uuid not null references public.tarefa_modelos(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  tipo text not null check (tipo in ('INCLUIR', 'EXCLUIR')),
  primary key (modelo_id, company_id)
);

-- Carteira: responsável por empresa em cada departamento.
create table if not exists public.tarefa_responsaveis (
  company_id uuid not null references public.companies(id) on delete cascade,
  departamento_id uuid not null references public.atendimento_departamentos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  atualizado_em timestamptz not null default now(),
  primary key (company_id, departamento_id)
);
create index if not exists tarefa_responsaveis_user_idx on public.tarefa_responsaveis(user_id);

create table if not exists public.tarefas (
  id uuid primary key default gen_random_uuid(),
  modelo_id uuid not null references public.tarefa_modelos(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete cascade,
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  departamento_id uuid not null references public.atendimento_departamentos(id) on delete restrict,
  responsavel_id uuid references public.profiles(id) on delete set null,
  prazo_meta date,
  prazo_legal date,
  status text not null default 'A_FAZER'
    check (status in ('A_FAZER', 'EM_ANDAMENTO', 'CONCLUIDA', 'NAO_SE_APLICA')),
  comentario text,
  concluida_em timestamptz,
  concluida_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (modelo_id, company_id, competencia)
);
create index if not exists tarefas_competencia_idx on public.tarefas(competencia);
create index if not exists tarefas_responsavel_aberta_idx on public.tarefas(responsavel_id, prazo_meta)
  where status in ('A_FAZER', 'EM_ANDAMENTO');
create index if not exists tarefas_company_idx on public.tarefas(company_id, competencia);
create trigger tarefas_set_updated_at before update on public.tarefas
  for each row execute function public.set_updated_at();

create table if not exists public.tarefa_eventos (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  tipo text not null,               -- STATUS, RESPONSAVEL, COMENTARIO
  de text,
  para text,
  comentario text,
  created_at timestamptz not null default now()
);
create index if not exists tarefa_eventos_tarefa_idx on public.tarefa_eventos(tarefa_id, created_at);

alter table public.tarefa_modelos enable row level security;
alter table public.tarefa_modelo_excecoes enable row level security;
alter table public.tarefa_responsaveis enable row level security;
alter table public.tarefas enable row level security;
alter table public.tarefa_eventos enable row level security;

drop policy if exists tarefa_modelos_all on public.tarefa_modelos;
create policy tarefa_modelos_all on public.tarefa_modelos
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
drop policy if exists tarefa_modelo_excecoes_all on public.tarefa_modelo_excecoes;
create policy tarefa_modelo_excecoes_all on public.tarefa_modelo_excecoes
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
drop policy if exists tarefa_responsaveis_all on public.tarefa_responsaveis;
create policy tarefa_responsaveis_all on public.tarefa_responsaveis
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
drop policy if exists tarefas_all on public.tarefas;
create policy tarefas_all on public.tarefas
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));
drop policy if exists tarefa_eventos_all on public.tarefa_eventos;
create policy tarefa_eventos_all on public.tarefa_eventos
  for all using ((select public.is_soma_staff())) with check ((select public.is_soma_staff()));

-- Modelos sugeridos (docs/tarefas.md §7) — entram DESATIVADOS: o Wellington
-- revisa, ajusta e ativa em Configurações › Modelos de tarefa. Nada é gerado
-- antes disso.
insert into public.tarefa_modelos
  (nome, departamento_id, periodicidade, meses, prazo_tipo, agenda_chave, dia_prazo, mes_prazo_offset,
   aplica_regimes, aplica_pessoa, aplica_municipios, aplica_folha, ativo, ordem)
select v.nome, d.id, v.periodicidade, v.meses, v.prazo_tipo, v.agenda_chave, v.dia_prazo, v.offset_,
       v.regimes, v.pessoa, v.municipios, v.folha, false, v.ordem
from (values
  ('Apurar Simples (PGDAS-D) e enviar DAS', 'Fiscal', 'MENSAL', null::int[], 'AGENDA', 'DECLARACAO:pgdas-d', null::int, 1,
     array['SIMPLES_NACIONAL'], 'PJ', null::text[], null::boolean, 10),
  ('Apurar PIS/COFINS e enviar DARF', 'Fiscal', 'MENSAL', null, 'AGENDA', 'TRIBUTO:8109', null, 1,
     array['LUCRO_PRESUMIDO','LUCRO_REAL'], 'PJ', null, null, 20),
  ('Apurar IRPJ/CSLL do trimestre', 'Fiscal', 'TRIMESTRAL', array[3,6,9,12], 'AGENDA', 'TRIBUTO:2089', null, 1,
     array['LUCRO_PRESUMIDO','LUCRO_REAL'], 'PJ', null, null, 30),
  ('ISS próprio — Nota Carioca', 'Fiscal', 'MENSAL', null, 'DIA_FIXO', null, 10, 1,
     null, 'PJ', array['3304557'], null, 40),
  ('ISS próprio — Petrópolis', 'Fiscal', 'MENSAL', null, 'DIA_FIXO', null, 10, 1,
     null, 'PJ', array['3303906'], null, 50),
  ('EFD-Reinf', 'Fiscal', 'MENSAL', null, 'AGENDA', 'DECLARACAO:efd-reinf', null, 1,
     array['LUCRO_PRESUMIDO','LUCRO_REAL'], 'PJ', null, null, 60),
  ('DCTFWeb', 'Fiscal', 'MENSAL', null, 'AGENDA', 'DECLARACAO:dctfweb', null, 1,
     array['LUCRO_PRESUMIDO','LUCRO_REAL','IMUNE_ISENTO'], 'PJ', null, null, 70),
  ('EFD-Contribuições', 'Fiscal', 'MENSAL', null, 'AGENDA', 'DECLARACAO:efd-contribuicoes', null, 2,
     array['LUCRO_PRESUMIDO','LUCRO_REAL'], 'PJ', null, null, 80),
  ('Folha e pró-labore', 'Departamento Pessoal', 'MENSAL', null, 'DIA_FIXO', null, 5, 1,
     null, 'PJ', null, true, 100),
  ('eSocial — fechamento (S-1299)', 'Departamento Pessoal', 'MENSAL', null, 'DIA_FIXO', null, 15, 1,
     null, 'PJ', null, true, 110),
  ('FGTS Digital', 'Departamento Pessoal', 'MENSAL', null, 'DIA_FIXO', null, 20, 1,
     null, 'PJ', null, true, 120),
  ('INSS/IRRF da folha (DCTFWeb)', 'Departamento Pessoal', 'MENSAL', null, 'AGENDA', 'TRIBUTO:1082', null, 1,
     null, 'PJ', null, true, 130),
  ('Conciliação bancária e lançamentos', 'Contabilidade', 'MENSAL', null, 'DIA_FIXO', null, 20, 1,
     array['LUCRO_PRESUMIDO','LUCRO_REAL','IMUNE_ISENTO'], 'PJ', null, null, 200),
  ('Balancete do mês', 'Contabilidade', 'MENSAL', null, 'DIA_FIXO', null, 25, 1,
     array['LUCRO_PRESUMIDO','LUCRO_REAL','IMUNE_ISENTO'], 'PJ', null, null, 210),
  ('Situação fiscal (SITFIS) e certidões', 'Legalização', 'MENSAL', null, 'DIA_FIXO', null, 10, 1,
     null, 'PJ', null, null, 300),
  ('Carnê-Leão — apurar e enviar DARF', 'Pessoa Física - CPF - Carnê Leão', 'MENSAL', null, 'AGENDA', 'TRIBUTO:0190', null, 1,
     null, 'PF', null, null, 400),
  ('DEFIS', 'Fiscal', 'ANUAL', array[12], 'AGENDA', 'DECLARACAO:defis', null, 3,
     array['SIMPLES_NACIONAL'], 'PJ', null, null, 500),
  ('DIRPF', 'Pessoa Física - CPF - Carnê Leão', 'ANUAL', array[12], 'AGENDA', 'DECLARACAO:dirpf', null, 5,
     null, 'PF', null, null, 510)
) as v(nome, depto, periodicidade, meses, prazo_tipo, agenda_chave, dia_prazo, offset_, regimes, pessoa, municipios, folha, ordem)
join public.atendimento_departamentos d on d.nome = v.depto
where not exists (select 1 from public.tarefa_modelos);
