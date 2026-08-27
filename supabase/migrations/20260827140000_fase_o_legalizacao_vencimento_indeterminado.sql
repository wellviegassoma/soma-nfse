-- Alguns documentos de legalização (ex.: certos Alvarás municipais) são
-- emitidos com validade indeterminada — não vencem, só são revogados.
-- data_vencimento passa a aceitar null pra cobrir esse caso: null = "sem
-- vencimento" (não é falta de informação, é a condição real do documento).

alter table public.legalizacao_documentos
  alter column data_vencimento drop not null;

comment on column public.legalizacao_documentos.data_vencimento is
  'Data de vencimento do documento — null quando o documento tem validade indeterminada (não vence).';
