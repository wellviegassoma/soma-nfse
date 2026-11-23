-- IRPF: etapa "Documentos recebidos" no fluxo da declaração (quadro Kanban,
-- pedido do Wellington 23/11/2026). Fluxo:
-- Não iniciada → Aguardando documentos → Documentos recebidos → Em elaboração
-- → Em revisão → Aguardando aprovação do cliente → Aprovada → Transmitida
-- (+ Não fará, fora do quadro).
alter table public.irpf_declaracoes drop constraint if exists irpf_declaracoes_status_check;
alter table public.irpf_declaracoes add constraint irpf_declaracoes_status_check check (status in (
  'NAO_INICIADA', 'AGUARDANDO_DOCUMENTOS', 'DOCUMENTOS_RECEBIDOS', 'EM_ELABORACAO', 'EM_REVISAO',
  'AGUARDANDO_APROVACAO', 'APROVADA', 'TRANSMITIDA', 'NAO_FARA'
));
