-- O site de ISS de Petrópolis (petropolis-rj.prefeituramoderna.com.br)
-- identifica cada empresa pelo "CMC" (Código Municipal do Contribuinte),
-- não pelo CNPJ — a busca por CNPJ do site não filtra de verdade (sempre
-- devolve o mesmo placeholder, achado real pela empresa RRAD, ver
-- backend/petropolis_client.py). O jeito confiável é descobrir o CMC uma
-- vez (logando com o login único do escritório, abrindo
-- iss-clientes_contador.php sem filtro nenhum logo após o login — só aí
-- o site devolve a lista completa de clientes) e guardar aqui pra nunca
-- mais precisar da busca quebrada pra essa empresa.
alter table public.companies
  add column petropolis_cmc text;

comment on column public.companies.petropolis_cmc is
  'Código Municipal do Contribuinte no site de ISS de Petrópolis — só preenchido quando a empresa é cliente do escritório lá E descoberto manualmente (não é a Inscrição Municipal genérica).';

-- Confirmados ao vivo em 2026-10-01 (CNPJ conferido contra o que o site
-- devolveu ao trocar pra cada CMC — ver conversa da sessão que achou isso).
update public.companies set petropolis_cmc = '2011198526' where cnpj = '60351564000109'; -- ESPACO CLINICO VITAE LTDA
update public.companies set petropolis_cmc = '2011141065' where cnpj = '58193114000185'; -- FB HEALTH CARE LTDA
update public.companies set petropolis_cmc = '97556'      where cnpj = '12423766000168'; -- KRYGIER ODONTOLOGIA LTDA
update public.companies set petropolis_cmc = '96633'      where cnpj = '11427305000109'; -- ORTOP SERVICOS MEDICOS LTDA
update public.companies set petropolis_cmc = '2011141266' where cnpj = '58703328000154'; -- PAULO COUTINHO ORTODONTIA E ODONTOPEDIATRIA LTDA
update public.companies set petropolis_cmc = '2011200365' where cnpj = '63355692000100'; -- TRAD TO TREND PARTNERS LTDA
