-- IRPF (24/11/2026):
-- 1) Senha do gov.br do contribuinte, cifrada (AES-256-GCM com a
--    MASTER_ENCRYPTION_KEY, mesmo esquema do cofre de senhas). Quem tem
--    irpf.ver pode revelar; toda revelação vai para audit_logs.
-- 2) Situação na Receita depois da entrega (coluna "Status 2" da planilha
--    do Wellington): Em processamento, Processada, Pendência, Malha fina,
--    Restituição paga, Sem acesso ao gov.br.
alter table public.irpf_contribuintes
  add column if not exists govbr_senha_cifrada bytea,
  add column if not exists govbr_senha_atualizada_em timestamptz,
  add column if not exists govbr_senha_atualizada_por uuid references public.profiles(id) on delete set null;

alter table public.irpf_declaracoes
  add column if not exists situacao_receita text check (situacao_receita in (
    'EM_PROCESSAMENTO', 'PROCESSADA', 'PENDENCIA', 'MALHA', 'RESTITUICAO_PAGA', 'SEM_GOVBR'
  )),
  add column if not exists situacao_receita_em date;
