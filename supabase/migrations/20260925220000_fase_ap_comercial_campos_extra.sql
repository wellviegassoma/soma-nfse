-- Fase AP — Módulo Comercial: campos extras pedidos após o uso real do
-- quadro (separar cidade de especialidade, origem do lead, arquivar prospect
-- sem apagar histórico).
alter table public.comercial_prospects
  add column cidade text,
  add column origem_lead text
    check (origem_lead in ('INSTAGRAM', 'AULA', 'INDICACAO', 'OUTRO')),
  add column indicado_por text,
  add column arquivado_em timestamptz;

comment on column public.comercial_prospects.arquivado_em is
  'Arquivamento reversível (soft) — prospect some do quadro mas mantém checklist/histórico/atividade. Null = ativo.';

create index comercial_prospects_arquivado_idx on public.comercial_prospects(arquivado_em);
