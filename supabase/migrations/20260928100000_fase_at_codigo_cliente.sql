-- Fase AT — Código de cliente: número usado nas pastas físicas/de rede do
-- escritório (ex.: "394 - Gines Alves"), pra cruzar empresa do app com a
-- pasta de documentos sem depender de nome (que muda, tem acento, etc.).
alter table public.companies add column codigo_cliente text;
create unique index companies_codigo_cliente_uniq on public.companies(codigo_cliente) where codigo_cliente is not null;
comment on column public.companies.codigo_cliente is 'Número da pasta de documentos do cliente (texto pra preservar zero à esquerda, ex.: "007").';
