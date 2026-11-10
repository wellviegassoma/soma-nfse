-- Nota emitida pelo próprio soma-nfse entra no fechamento na hora da
-- emissão (com o XML devolvido pela Sefin), sem esperar a distribuição do
-- ADN, que pode levar horas. Quando a sincronização trouxer a mesma nota,
-- o upsert por (company_id, chave_acesso) com ignoreDuplicates não duplica.

alter table public.notas_distribuidas drop constraint if exists notas_distribuidas_origem_check;
alter table public.notas_distribuidas
  add constraint notas_distribuidas_origem_check
  check (origem in ('distribuicao', 'importado_manual', 'emitido_sistema'));
