-- Fase CL — SEI: documento listado no processo mas que o acesso externo da
-- SOMA não deixa abrir (o SEI não monta o link). Não é erro de sincronização;
-- a extensão continua tentando a cada rodada e limpa a marca se baixar.
alter table public.sei_documentos
  add column if not exists sem_acesso_em timestamptz;
