-- O histórico societário até aqui era uma lista só (contrato social +
-- alterações). Passa a ter categorias — IPTU (documento próprio, aceita
-- vários arquivos ao longo do tempo) e "outros documentos" (repositório
-- livre pra qualquer coisa relevante — contrato de locação, etc.) — sem
-- criar tabela nova, só uma coluna pra separar visualmente as seções.
-- Linhas já existentes são todas do histórico de contrato social/alterações.
alter table public.societario_documentos
  add column categoria text not null default 'contrato_social'
    check (categoria in ('contrato_social', 'iptu', 'outros'));
