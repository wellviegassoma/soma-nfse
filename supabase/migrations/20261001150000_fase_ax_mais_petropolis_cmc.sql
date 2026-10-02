-- Continuação da migration 20261001130000 — mais 21 CMCs descobertos na
-- mesma sessão de login único do escritório no ISS de Petrópolis (lista
-- completa de 39 clientes vista pelo usuário ao vivo e cruzada contra o
-- nosso cadastro por nome). 18 batem nome exato; 3 têm nome levemente
-- diferente do nosso cadastro mas foram confirmadas pelo usuário como a
-- mesma empresa (KARINI FARIA, VERSATILE/"VERSALITE" — grafia do site da
-- prefeitura — e a própria SOMA Contabilidade, cujo CNPJ já tinha sido
-- visto ao vivo na tela de login: 43.852.255/0001-95).
update public.companies set petropolis_cmc = '2011198510' where cnpj = '60364517000191'; -- CREZO ODONTOLOGIA ESPECIALIZADA LTDA
update public.companies set petropolis_cmc = '2011200089' where cnpj = '65124876000195'; -- MC GLOBAL TREINAMENTOS LTDA
update public.companies set petropolis_cmc = '2011199310' where cnpj = '62541177000152'; -- MFR ODONTOLOGIA LTDA
update public.companies set petropolis_cmc = '2011200227' where cnpj = '65875881000130'; -- ODONTO ITAMARATI LTDA
update public.companies set petropolis_cmc = '2011200164' where cnpj = '65064501000187'; -- 2Z2S SERVICOS MEDICOS LTDA
update public.companies set petropolis_cmc = '2011141161' where cnpj = '58288916000179'; -- ACP CENTRO DE DIAGNOSTICOS ODONTOLOGICOS DE PETROPOLIS LTDA.
update public.companies set petropolis_cmc = '2011141019' where cnpj = '57885141000156'; -- CLINICA MULTI MEDIC QUITANDINHA LTDA
update public.companies set petropolis_cmc = '2011140824' where cnpj = '57251785000192'; -- CLINICA ODONTOLOGICA RAFAELA WOLLNER INFANTE LTDA
update public.companies set petropolis_cmc = '2011132764' where cnpj = '35768063000177'; -- CLINICA MULTI MEDIC LTDA
update public.companies set petropolis_cmc = '95010'      where cnpj = '10408679000106'; -- DENT CLINIC ODONTOLOGIA INTEGRADA LTDA
update public.companies set petropolis_cmc = '2011139799' where cnpj = '54265748000145'; -- HERA MEDICINA INTEGRADA LTDA
update public.companies set petropolis_cmc = '2011141468' where cnpj = '59380355000104'; -- JOSY TAVARES BEAUTY LTDA
update public.companies set petropolis_cmc = '2011138017' where cnpj = '50620927000100'; -- MONTEIRO MEDICINA INTEGRAL LTDA
update public.companies set petropolis_cmc = '2011199520' where cnpj = '62274078000151'; -- OMNIFACE - TRATAMENTO APRIMORAMENTO E ENSINO EM SAUDE LTDA
update public.companies set petropolis_cmc = '2011140983' where cnpj = '57181197000120'; -- R. & M. CONSULTORIO MEDICO LTDA.
update public.companies set petropolis_cmc = '2011140953' where cnpj = '55671794000107'; -- RAMOS MARTINS ODONTOLOGIA LTDA
update public.companies set petropolis_cmc = '2011200492' where cnpj = '66930549000193'; -- TECRADIO RADIOLOGIA LTDA
update public.companies set petropolis_cmc = '11128108'   where cnpj = '30247447000120'; -- YUME ODONTOLOGIA LTDA
update public.companies set petropolis_cmc = '2011133769' where cnpj = '46561879000141'; -- KARINI FARIA - CIRURGIA BUCO-MAXILO-FACIAL LTDA (site: "KARINI FARIA - ODONTOLOGIA ESPECIALIZADA")
update public.companies set petropolis_cmc = '11129956'   where cnpj = '31436521000110'; -- VERSATILE ODONTOLOGIA E CURSOS LTDA (site: "VERSALITE")
update public.companies set petropolis_cmc = '2011136877' where cnpj = '43852255000195'; -- SOMA Contabilidade Integrada LTDA (o próprio escritório)
