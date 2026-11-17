-- Fase BM: nota de EXPORTAÇÃO de serviço (tribISSQN = 3 na NFS-e Nacional).
--
-- Achado em 17/11/2026 (MC GLOBAL TREINAMENTOS, Simples Nacional, Petrópolis):
-- as notas saem com tribISSQN 3 ("exportação de serviço"), que a Prefeitura
-- lança fora do quadro de tributação (lançamento sem vínculo com município)
-- e o PGDAS-D trata como "mercado externo" — só IRPJ, CSLL e CPP; sem PIS,
-- COFINS nem ISS. O sistema somava tudo como mercado interno: DAS a maior,
-- declaração errada e conferência com a Prefeitura sempre divergente.
--
-- Coluna calculada a partir do XML já guardado: vale para as notas antigas
-- (preenchida ao aplicar) e para as novas, sem mexer na sincronização.
-- Domínio tribISSQN: 1 tributável, 2 imunidade, 3 exportação, 4 não incidência.

alter table public.notas_distribuidas
  add column if not exists exportacao boolean
  generated always as (coalesce(xml, '') ~ '<tribISSQN>3</tribISSQN>') stored;

comment on column public.notas_distribuidas.exportacao is
  'Nota de exportação de serviço (tribISSQN = 3): no Simples entra como mercado externo (sem PIS/COFINS/ISS) e não aparece no quadro de tributação da Prefeitura. Calculada do XML.';
