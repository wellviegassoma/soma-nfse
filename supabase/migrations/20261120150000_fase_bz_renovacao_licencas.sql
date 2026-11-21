-- Fase BZ: processo de renovação de licença (pedido de 20/11/2026), fase 2
-- do controle de alvarás e licenças.
--
-- A renovação é mais um tipo de processo de legalização (RENOVACAO), com o
-- mesmo motor de fases/atividade/anexos de Abertura, Alteração e
-- Encerramento, ligado à licença que está sendo renovada (empresa + tipo).
-- Ganha protocolo e guia, e um checklist de documentos copiado do cadastro
-- de requisitos do tipo + município na hora em que o processo nasce.

-- 1) Novo tipo de processo e nova ação de fase ---------------------------------
-- Derruba as checks antigas pelo conteúdo (não pelo nome gerado), pra não
-- sobrar uma check velha bloqueando o valor novo.
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tabela, c.conname
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid in ('public.legalizacao_processos'::regclass, 'public.legalizacao_fluxos'::regclass,
                         'public.legalizacao_processo_fases'::regclass, 'public.legalizacao_fluxo_fases_template'::regclass)
      and (pg_get_constraintdef(c.oid) like '%tipo_processo%''ENCERRAMENTO''%'
           or pg_get_constraintdef(c.oid) like '%acao%''CRIAR_EMPRESA''%')
  loop
    execute format('alter table %s drop constraint %I', r.tabela, r.conname);
  end loop;
end $$;

alter table public.legalizacao_processos drop constraint if exists legalizacao_processos_tipo_processo_check;
alter table public.legalizacao_processos add constraint legalizacao_processos_tipo_processo_check
  check (tipo_processo in ('ABERTURA', 'ALTERACAO', 'ENCERRAMENTO', 'RENOVACAO'));

alter table public.legalizacao_fluxos drop constraint if exists legalizacao_fluxos_tipo_processo_check;
alter table public.legalizacao_fluxos add constraint legalizacao_fluxos_tipo_processo_check
  check (tipo_processo in ('ABERTURA', 'ALTERACAO', 'ENCERRAMENTO', 'RENOVACAO'));

-- ANEXAR_LICENCA: a fase só conclui depois que a licença nova foi anexada
-- na tela da empresa (a anterior vai pro histórico).
alter table public.legalizacao_processo_fases drop constraint if exists legalizacao_processo_fases_acao_check;
alter table public.legalizacao_processo_fases add constraint legalizacao_processo_fases_acao_check
  check (acao in ('CRIAR_EMPRESA', 'ANEXAR_LICENCA'));

alter table public.legalizacao_fluxo_fases_template drop constraint if exists legalizacao_fluxo_fases_template_acao_check;
alter table public.legalizacao_fluxo_fases_template add constraint legalizacao_fluxo_fases_template_acao_check
  check (acao in ('CRIAR_EMPRESA', 'ANEXAR_LICENCA'));

-- 2) Campos da renovação no processo -------------------------------------------
alter table public.legalizacao_processos
  add column if not exists licenca_tipo_id uuid references public.legalizacao_tipos_documento(id) on delete restrict,
  add column if not exists licenca_vencimento date,          -- vencimento da licença quando a renovação abriu
  add column if not exists protocolo_numero text,
  add column if not exists protocolo_data date,
  add column if not exists guia_valor numeric(12, 2) check (guia_valor is null or guia_valor >= 0),
  add column if not exists guia_vencimento date,
  add column if not exists origem_renovacao text check (origem_renovacao is null or origem_renovacao in ('MANUAL', 'AUTOMATICA'));

alter table public.legalizacao_processos drop constraint if exists legalizacao_processos_renovacao_tem_licenca;
alter table public.legalizacao_processos add constraint legalizacao_processos_renovacao_tem_licenca
  check ((tipo_processo = 'RENOVACAO') = (licenca_tipo_id is not null));

-- Uma renovação aberta por empresa + tipo de licença.
create unique index if not exists legalizacao_processos_uma_renovacao_aberta
  on public.legalizacao_processos(company_id, licenca_tipo_id)
  where tipo_processo = 'RENOVACAO' and data_conclusao is null and arquivado_em is null;

-- 3) Requisitos (checklist de documentos) por tipo + município ----------------
create table if not exists public.legalizacao_requisitos (
  id uuid primary key default gen_random_uuid(),
  tipo_id uuid not null references public.legalizacao_tipos_documento(id) on delete cascade,
  municipality_ibge_code text check (municipality_ibge_code is null or municipality_ibge_code ~ '^\d{7}$'),
  municipality_name text,
  state text,
  item text not null,
  ordem int not null default 100,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists legalizacao_requisitos_tipo_municipio_idx
  on public.legalizacao_requisitos(tipo_id, municipality_ibge_code);

alter table public.legalizacao_requisitos enable row level security;
drop policy if exists legalizacao_requisitos_select on public.legalizacao_requisitos;
create policy legalizacao_requisitos_select on public.legalizacao_requisitos
  for select using ((select public.tem_permissao('legalizacao.ver')));
drop policy if exists legalizacao_requisitos_write on public.legalizacao_requisitos;
create policy legalizacao_requisitos_write on public.legalizacao_requisitos
  for all using ((select public.tem_permissao('legalizacao.editar')))
  with check ((select public.tem_permissao('legalizacao.editar')));

-- Cópia do checklist no processo (mudar o cadastro depois não mexe nos
-- processos já abertos).
create table if not exists public.legalizacao_processo_requisitos (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.legalizacao_processos(id) on delete cascade,
  item text not null,
  ordem int not null default 100,
  recebido_em timestamptz,
  recebido_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists legalizacao_processo_requisitos_processo_idx
  on public.legalizacao_processo_requisitos(processo_id, ordem);

alter table public.legalizacao_processo_requisitos enable row level security;
drop policy if exists legalizacao_processo_requisitos_select on public.legalizacao_processo_requisitos;
create policy legalizacao_processo_requisitos_select on public.legalizacao_processo_requisitos
  for select using ((select public.tem_permissao('legalizacao.ver')));
drop policy if exists legalizacao_processo_requisitos_write on public.legalizacao_processo_requisitos;
create policy legalizacao_processo_requisitos_write on public.legalizacao_processo_requisitos
  for all using ((select public.tem_permissao('legalizacao.editar')))
  with check ((select public.tem_permissao('legalizacao.editar')));

-- 4) Fluxo padrão de renovação ---------------------------------------------------
do $$
declare v_fluxo uuid;
begin
  select id into v_fluxo from public.legalizacao_fluxos where chave = 'RENOVACAO_LICENCA';
  if v_fluxo is null then
    insert into public.legalizacao_fluxos (chave, nome, tipo_processo, ordem)
      values ('RENOVACAO_LICENCA', 'Renovação de Licença', 'RENOVACAO', 40)
      returning id into v_fluxo;
    insert into public.legalizacao_fluxo_fases_template (fluxo_id, nome, ordem, acao) values
      (v_fluxo, 'Guia emitida', 10, null),
      (v_fluxo, 'Guia enviada ao cliente', 20, null),
      (v_fluxo, 'Guia paga', 30, null),
      (v_fluxo, 'Documentos do cliente recebidos', 40, null),
      (v_fluxo, 'Protocolado', 50, null),
      (v_fluxo, 'Em análise / exigência', 60, null),
      (v_fluxo, 'Licença deferida e anexada', 70, 'ANEXAR_LICENCA');
  end if;
end $$;

-- 5) Checklists conhecidos (planilha "MAPA E CONTROLE – Vigilância Sanitária")
insert into public.legalizacao_requisitos (tipo_id, municipality_ibge_code, municipality_name, state, item, ordem)
select t.id, r.ibge, r.nome, 'RJ', r.item, r.ordem
from public.legalizacao_tipos_documento t
cross join (values
  ('3303906', 'Petrópolis', 'Formulário de protocolo', 10),
  ('3303906', 'Petrópolis', 'Alvará', 20),
  ('3303906', 'Petrópolis', 'Cartão CNPJ', 30),
  ('3303906', 'Petrópolis', 'Certificado do conselho de classe (CRO, CREMERJ…)', 40),
  ('3303906', 'Petrópolis', 'Taxa e comprovante de pagamento', 50),
  ('3303906', 'Petrópolis', 'Última licença sanitária', 60),
  ('3303906', 'Petrópolis', 'Laudo de potabilidade da água', 70),
  ('3303906', 'Petrópolis', 'Certificado de limpeza da caixa d''água', 80),
  ('3303906', 'Petrópolis', 'Certificado de controle de pragas com ordem de serviço', 90),
  ('3304557', 'Rio de Janeiro', 'Inscrição municipal', 10),
  ('3304557', 'Rio de Janeiro', 'Endereço compatível com o contrato social', 20),
  ('3304557', 'Rio de Janeiro', 'Área útil em m²', 30),
  ('3304557', 'Rio de Janeiro', 'E-mail e telefone de contato', 40),
  ('3304557', 'Rio de Janeiro', 'Horário de funcionamento', 50),
  ('3304557', 'Rio de Janeiro', 'Atividade exercida', 60),
  ('3303302', 'Niterói', 'Formulário de protocolo', 10),
  ('3303302', 'Niterói', 'Alvará', 20),
  ('3303302', 'Niterói', 'Cartão CNPJ', 30),
  ('3303302', 'Niterói', 'Certificado do conselho de classe (CRO, CREMERJ…)', 40),
  ('3303302', 'Niterói', 'Taxa e comprovante de pagamento', 50),
  ('3303302', 'Niterói', 'Última licença sanitária', 60),
  ('3303302', 'Niterói', 'Laudo de potabilidade da água', 70),
  ('3303302', 'Niterói', 'Certificado de limpeza da caixa d''água', 80),
  ('3303302', 'Niterói', 'Certificado de controle de pragas com ordem de serviço', 90),
  ('3303302', 'Niterói', 'Inscrição municipal', 100),
  ('3303302', 'Niterói', 'Área útil em m², horário de funcionamento e atividade exercida', 110)
) as r(ibge, nome, item, ordem)
where t.nome = 'Vigilância Sanitária'
  and not exists (
    select 1 from public.legalizacao_requisitos x
    where x.tipo_id = t.id and x.municipality_ibge_code = r.ibge and x.item = r.item
  );
