// GERADO por scripts/tabelas-servico/gerar_ibscbs.py — não editar à mão.
// Fonte: Anexo VIII v1.02.00 (26/10/2026) da NFS-e Nacional — correlação Item LC 116 × NBS ×
// cIndOp × cClassTrib. https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc
// O próprio governo diz que a tabela ainda está em construção: é sugestão, não validação.

export type CorrelacaoIbsCbs = { descricao: string; cClassTrib: string[]; indOp: string[]; nbs: string[] };

/** Chave: item LC 116 com ponto (ex.: "04.01"). */
export const IBSCBS_POR_ITEM: Record<string, CorrelacaoIbsCbs> = {
 "01.01": {
  "descricao": "Análise E Desenvolvimento De Sistemas.",
  "cClassTrib": [
   "000001",
   "200043",
   "200044"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "115021000",
   "115022000",
   "115024000",
   "115025000",
   "115029000",
   "115030000",
   "115040000",
   "115050000",
   "115071000",
   "115072000",
   "115079000"
  ]
 },
 "01.02": {
  "descricao": "Programação.",
  "cClassTrib": [
   "000001",
   "200043",
   "200044"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "115021000",
   "115022000",
   "115029000"
  ]
 },
 "01.03": {
  "descricao": "Processamento, Armazenamento Ou Hospedagem De Dados, Textos, Imagens, Vídeos, Páginas Eletrônicas, Aplicativos E Sistemas De Informação, Entre Outros Formatos, E Congêneres. (Redação Dada Pela Lei Complementar Nº 157, De 2016)",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "115061000",
   "115062100",
   "115062200",
   "115062300",
   "115062900",
   "115069000",
   "115090000"
  ]
 },
 "01.04": {
  "descricao": "Elaboração De Programas De Computadores, Inclusive De Jogos Eletrônicos, Independentemente Da Arquitetura Construtiva Da Máquina Em Que O Programa Será Executado, Incluindo Tablets, Smartphones E Congêneres. (Redação Dada Pela Lei Complementar Nº 157, De 2016)",
  "cClassTrib": [
   "000001",
   "200043",
   "200044"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "115021000",
   "115022000",
   "115029000"
  ]
 },
 "01.05": {
  "descricao": "Licenciamento Ou Cessão De Direito De Uso De Programas De Computação.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100501"
  ],
  "nbs": [
   "111032100",
   "111032200",
   "111032300",
   "111032900",
   "111062000",
   "111072000",
   "115062100"
  ]
 },
 "01.06": {
  "descricao": "Assessoria E Consultoria Em Informática.",
  "cClassTrib": [
   "000001",
   "200043",
   "200044"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "115011000",
   "115012000",
   "115071000",
   "115072000",
   "115079000",
   "115100000"
  ]
 },
 "01.07": {
  "descricao": "Suporte Técnico Em Informática, Inclusive Instalação, Configuração E Manutenção De Programas De Computação E Bancos De Dados.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "050101",
   "050102",
   "100301"
  ],
  "nbs": [
   "115013000",
   "115080000",
   "115021000",
   "115022000"
  ]
 },
 "01.08": {
  "descricao": "Planejamento, Confecção, Manutenção E Atualização De Páginas Eletrônicas.",
  "cClassTrib": [
   "000001",
   "200040"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "115023000"
  ]
 },
 "01.09": {
  "descricao": "Disponibilização, Sem Cessão Definitiva, De Conteúdos De Áudio, Vídeo, Imagem E Texto Por Meio Da Internet, Respeitada A Imunidade De Livros, Jornais E Periódicos (Exceto A Distribuição De Conteúdos Pelas Prestadoras De Serviço De Acesso Condicionado, De Que Trata A Lei No 12.485, De 12 De Setembro De 2011, Sujeita Ao ICMS). (Incluído Pela Lei Complementar Nº 157, De 2016)",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "117031000",
   "117032100",
   "117032200",
   "117033100",
   "117033200",
   "117039100",
   "117039200",
   "117039900"
  ]
 },
 "02.01": {
  "descricao": "Serviços De Pesquisas E Desenvolvimento De Qualquer Natureza.",
  "cClassTrib": [
   "000001",
   "200016"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "112011100",
   "112011200",
   "112011900",
   "112012000",
   "112013100",
   "112013200",
   "112013300",
   "112013400",
   "112013900",
   "112014000",
   "112015000",
   "112019000",
   "112021000",
   "112022000",
   "112023000",
   "112024000",
   "112029000",
   "112030000"
  ]
 },
 "03.02": {
  "descricao": "Cessão De Direito De Uso De Marcas E De Sinais De Propaganda.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100501"
  ],
  "nbs": [
   "111033300",
   "111042000",
   "111063300",
   "111073300",
   "111082000"
  ]
 },
 "03.03": {
  "descricao": "Exploração De Salões De Festas, Centro De Convenções, Escritórios Virtuais, Stands, Quadras Esportivas, Estádios, Ginásios, Auditórios, Casas De Espetáculos, Parques De Diversões, Canchas E Congêneres, Para Realização De Eventos Ou Negócios De Qualquer Natureza.",
  "cClassTrib": [
   "200027"
  ],
  "indOp": [
   "020101"
  ],
  "nbs": [
   "118053100",
   "118066100",
   "118066200",
   "118066300",
   "125080000"
  ]
 },
 "03.04": {
  "descricao": "Locação, Sublocação, Arrendamento, Direito De Passagem Ou Permissão De Uso, Compartilhado Ou Não, De Ferrovia, Rodovia, Postes, Cabos, Dutos E Condutos De Qualquer Natureza.",
  "cClassTrib": [
   "200027"
  ],
  "indOp": [
   "020401"
  ],
  "nbs": [
   "110011210"
  ]
 },
 "03.05": {
  "descricao": "Cessão De Andaimes, Palcos, Coberturas E Outras Estruturas De Uso Temporário.",
  "cClassTrib": [
   "000001",
   "200039"
  ],
  "indOp": [
   "050101",
   "050102"
  ],
  "nbs": [
   "101057000",
   "101055000"
  ]
 },
 "04.01": {
  "descricao": "Medicina E Biomedicina.",
  "cClassTrib": [
   "200029"
  ],
  "indOp": [
   "030101",
   "030102",
   "100301"
  ],
  "nbs": [
   "123012200"
  ]
 },
 "04.02": {
  "descricao": "Análises Clínicas, Patologia, Eletricidade Médica, Radioterapia, Quimioterapia, Ultra-Sonografia, Ressonância Magnética, Radiologia, Tomografia E Congêneres.",
  "cClassTrib": [
   "200029"
  ],
  "indOp": [
   "030101",
   "030102",
   "100301"
  ],
  "nbs": [
   "123019300",
   "123019400"
  ]
 },
 "04.03": {
  "descricao": "Hospitais, Clínicas, Laboratórios, Sanatórios, Manicômios, Casas De Saúde, Prontos-Socorros, Ambulatórios E Congêneres.",
  "cClassTrib": [
   "200029"
  ],
  "indOp": [
   "030101",
   "030102"
  ],
  "nbs": [
   "123011100",
   "123011200",
   "123011300",
   "123011400",
   "123011500",
   "123011900",
   "123012100",
   "123019300"
  ]
 },
 "04.04": {
  "descricao": "Instrumentação Cirúrgica.",
  "cClassTrib": [
   "200029"
  ],
  "indOp": [
   "030101",
   "030102"
  ],
  "nbs": [
   "123011100"
  ]
 },
 "04.05": {
  "descricao": "Acupuntura.",
  "cClassTrib": [
   "200029"
  ],
  "indOp": [
   "030101",
   "030102"
  ],
  "nbs": [
   "123019900"
  ]
 },
 "04.06": {
  "descricao": "Enfermagem, Inclusive Serviços Auxiliares.",
  "cClassTrib": [
   "200029"
  ],
  "indOp": [
   "030101",
   "030102"
  ],
  "nbs": [
   "123019100",
   "123019700"
  ]
 },
 "04.07": {
  "descricao": "Serviços farmacêuticos",
  "cClassTrib": [
   "200029"
  ],
  "indOp": [
   "030101",
   "030102",
   "100301"
  ],
  "nbs": [
   "123019900"
  ]
 },
 "04.08": {
  "descricao": "Terapia Ocupacional, Fisioterapia E Fonoaudiologia.",
  "cClassTrib": [
   "200029"
  ],
  "indOp": [
   "030101",
   "030102"
  ],
  "nbs": [
   "123019200",
   "123019900"
  ]
 },
 "04.09": {
  "descricao": "Terapias De Qualquer Espécie Destinadas Ao Tratamento Físico, Orgânico E Mental.",
  "cClassTrib": [
   "200029"
  ],
  "indOp": [
   "030101",
   "030102",
   "100301"
  ],
  "nbs": [
   "123019900"
  ]
 },
 "04.10": {
  "descricao": "Nutrição.",
  "cClassTrib": [
   "200029"
  ],
  "indOp": [
   "030101",
   "030102",
   "100301"
  ],
  "nbs": [
   "123019900"
  ]
 },
 "04.11": {
  "descricao": "Obstetrícia.",
  "cClassTrib": [
   "200029"
  ],
  "indOp": [
   "030101",
   "030102"
  ],
  "nbs": [
   "123011200",
   "123019700"
  ]
 },
 "04.12": {
  "descricao": "Odontologia.",
  "cClassTrib": [
   "200029"
  ],
  "indOp": [
   "030101",
   "030102"
  ],
  "nbs": [
   "123012300"
  ]
 },
 "04.13": {
  "descricao": "Ortóptica.",
  "cClassTrib": [
   "200029"
  ],
  "indOp": [
   "030101",
   "030102"
  ],
  "nbs": [
   "123019900"
  ]
 },
 "04.14": {
  "descricao": "Próteses Sob Encomenda.",
  "cClassTrib": [
   "200029"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "123019900"
  ]
 },
 "04.15": {
  "descricao": "Psicanálise.",
  "cClassTrib": [
   "200029"
  ],
  "indOp": [
   "030101",
   "030102",
   "100301"
  ],
  "nbs": [
   "123019900"
  ]
 },
 "04.16": {
  "descricao": "Psicologia.",
  "cClassTrib": [
   "200029"
  ],
  "indOp": [
   "030101",
   "030102",
   "100301"
  ],
  "nbs": [
   "123019800"
  ]
 },
 "04.17": {
  "descricao": "Casas De Repouso E De Recuperação, Creches, Asilos E Congêneres.",
  "cClassTrib": [
   "200029"
  ],
  "indOp": [
   "030101"
  ],
  "nbs": [
   "122011100",
   "123021000",
   "123022100",
   "123022200",
   "123022300",
   "123030000"
  ]
 },
 "04.18": {
  "descricao": "Inseminação Artificial, Fertilização In Vitro E Congêneres.",
  "cClassTrib": [
   "200029"
  ],
  "indOp": [
   "030101",
   "030102"
  ],
  "nbs": [
   "123012100"
  ]
 },
 "04.19": {
  "descricao": "Bancos De Sangue, Leite, Pele, Olhos, Óvulos, Sêmen E Congêneres.",
  "cClassTrib": [
   "200029"
  ],
  "indOp": [
   "050101"
  ],
  "nbs": [
   "123019500"
  ]
 },
 "04.20": {
  "descricao": "Coleta De Sangue, Leite, Tecidos, Sêmen, Órgãos E Materiais Biológicos De Qualquer Espécie.",
  "cClassTrib": [
   "200029"
  ],
  "indOp": [
   "030101",
   "030102"
  ],
  "nbs": [
   "123019500"
  ]
 },
 "04.21": {
  "descricao": "Unidade De Atendimento, Assistência Ou Tratamento Móvel E Congêneres.",
  "cClassTrib": [
   "200029"
  ],
  "indOp": [
   "030101",
   "030102"
  ],
  "nbs": [
   "123019600"
  ]
 },
 "04.22": {
  "descricao": "Planos De Medicina De Grupo Ou Individual E Convênios Para Prestação De Assistência Médica, Hospitalar, Odontológica E Congêneres.",
  "cClassTrib": [
   "820001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "109101000",
   "109109000"
  ]
 },
 "04.23": {
  "descricao": "Outros Planos De Saúde Que Se Cumpram Através De Serviços De Terceiros Contratados, Credenciados, Cooperados Ou Apenas Pagos Pelo Operador Do Plano Mediante Indicação Do Beneficiário.",
  "cClassTrib": [
   "820001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "109101000",
   "109109000"
  ]
 },
 "05.01": {
  "descricao": "Medicina Veterinária E Zootecnia.",
  "cClassTrib": [
   "200052",
   "200038"
  ],
  "indOp": [
   "050101",
   "050102",
   "100301"
  ],
  "nbs": [
   "114051200",
   "114052200",
   "114059000",
   "114109000"
  ]
 },
 "05.02": {
  "descricao": "Hospitais, Clínicas, Ambulatórios, Prontos-Socorros E Congêneres, Na Área Veterinária.",
  "cClassTrib": [
   "000001",
   "200038"
  ],
  "indOp": [
   "050101"
  ],
  "nbs": [
   "114051100",
   "114051200",
   "114052100",
   "114052200"
  ]
 },
 "05.03": {
  "descricao": "Laboratórios De Análise Na Área Veterinária.",
  "cClassTrib": [
   "000001",
   "200038"
  ],
  "indOp": [
   "050101"
  ],
  "nbs": [
   "114059000"
  ]
 },
 "05.04": {
  "descricao": "Inseminação Artificial, Fertilização In Vitro E Congêneres.",
  "cClassTrib": [
   "200038",
   "000001"
  ],
  "indOp": [
   "050101",
   "050102"
  ],
  "nbs": [
   "114052200",
   "114059000"
  ]
 },
 "05.05": {
  "descricao": "Bancos De Sangue E De Órgãos E Congêneres.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "050101"
  ],
  "nbs": [
   "114054000"
  ]
 },
 "05.06": {
  "descricao": "Coleta De Sangue, Leite, Tecidos, Sêmen, Órgãos E Materiais Biológicos De Qualquer Espécie.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "050101",
   "050102"
  ],
  "nbs": [
   "114054000"
  ]
 },
 "05.07": {
  "descricao": "Unidade De Atendimento, Assistência Ou Tratamento Móvel E Congêneres.",
  "cClassTrib": [
   "000001",
   "200038"
  ],
  "indOp": [
   "050101",
   "050102"
  ],
  "nbs": [
   "114051200",
   "114052200"
  ]
 },
 "05.08": {
  "descricao": "Guarda, Tratamento, Amestramento, Embelezamento, Alojamento E Congêneres.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "050101",
   "050102"
  ],
  "nbs": [
   "114056000"
  ]
 },
 "05.09": {
  "descricao": "Planos De Atendimento E Assistência Médico-Veterinária.",
  "cClassTrib": [
   "011005",
   "820003"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "114055000"
  ]
 },
 "06.01": {
  "descricao": "Barbearia, Cabeleireiros, Manicuros, Pedicuros E Congêneres.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "030101",
   "030102"
  ],
  "nbs": [
   "126021000",
   "126022000"
  ]
 },
 "06.02": {
  "descricao": "Esteticistas, Tratamento De Pele, Depilação E Congêneres.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "030101",
   "030102"
  ],
  "nbs": [
   "126022000",
   "126023000",
   "126029000"
  ]
 },
 "06.03": {
  "descricao": "Banhos, Duchas, Sauna, Massagens E Congêneres.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "030101",
   "030102"
  ],
  "nbs": [
   "126023000"
  ]
 },
 "06.04": {
  "descricao": "Ginástica, Dança, Esportes, Natação, Artes Marciais E Demais Atividades Físicas.",
  "cClassTrib": [
   "200041",
   "000001"
  ],
  "indOp": [
   "030101",
   "030102",
   "100301"
  ],
  "nbs": [
   "122051200",
   "125059000",
   "126023000"
  ]
 },
 "06.05": {
  "descricao": "Centros De Emagrecimento, Spa E Congêneres.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "030101",
   "030102"
  ],
  "nbs": [
   "126023000",
   "126029000"
  ]
 },
 "06.06": {
  "descricao": "Aplicação De Tatuagens, Piercings E Congêneres.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "030101",
   "030102"
  ],
  "nbs": [
   "126029000"
  ]
 },
 "07.01": {
  "descricao": "Engenharia, Agronomia, Agrimensura, Arquitetura, Geologia, Urbanismo, Paisagismo E Congêneres.",
  "cClassTrib": [
   "200052",
   "000001",
   "200038"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "114021100",
   "114021200",
   "114021300",
   "114021400",
   "114022100",
   "114022200",
   "114023100",
   "114023200",
   "114029000",
   "114031000",
   "114032110",
   "114032120",
   "114032211",
   "114032212",
   "114032213",
   "114032214",
   "114032221",
   "114032222",
   "114032223",
   "114032290",
   "114032300",
   "114032400",
   "114032500",
   "114032600",
   "114032700",
   "114032900",
   "114033000",
   "114039000",
   "114041100",
   "114041200",
   "114041300",
   "114041400",
   "114041900",
   "114109000"
  ]
 },
 "07.02": {
  "descricao": "Execução, Por Administração, Empreitada Ou Subempreitada, De Obras De Construção Civil, Hidráulica Ou Elétrica E De Outras Obras Semelhantes, Inclusive Sondagem, Perfuração De Poços, Escavação, Drenagem E Irrigação, Terraplanagem, Pavimentação, Concretagem E A Instalação E Montagem De Produtos, Peças E Equipamentos (Exceto O Fornecimento De Mercadorias Produzidas Pelo Prestador De Serviços Fora Do Local Da Prestação Dos Serviços, Que Fica Sujeito Ao ICMS).",
  "cClassTrib": [
   "200046",
   "200045",
   "200038"
  ],
  "indOp": [
   "020201",
   "020202"
  ],
  "nbs": [
   "101011100",
   "101011200",
   "101012100",
   "101012200",
   "101012900",
   "101013000",
   "101021100",
   "101021200",
   "101021300",
   "101022000",
   "101023100",
   "101023200",
   "101023300",
   "101023400",
   "101023510",
   "101023520",
   "101023530",
   "101024110",
   "101024120",
   "101024190",
   "101024210",
   "101024220",
   "101025100",
   "101025210",
   "101025220",
   "101025310",
   "101025320",
   "101026100",
   "101026900",
   "101027000",
   "101028000",
   "101029000",
   "101032000",
   "101033000",
   "101034100",
   "101034200",
   "101040000",
   "101051100",
   "101051200",
   "101052100",
   "101052200",
   "101053000",
   "101054000",
   "101055000",
   "101056000",
   "101059000",
   "101061100",
   "101061900",
   "101062100",
   "101062200",
   "101066000",
   "101073000",
   "101074000",
   "101063200",
   "101064000",
   "101079000"
  ]
 },
 "07.03": {
  "descricao": "Elaboração De Planos Diretores, Estudos De Viabilidade, Estudos Organizacionais E Outros, Relacionados Com Obras E Serviços De Engenharia; Elaboração De Anteprojetos, Projetos Básicos E Projetos Executivos Para Trabalhos De Engenharia.",
  "cClassTrib": [
   "000001",
   "200045",
   "200052"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "114021100",
   "114031000",
   "114022100",
   "114022200"
  ]
 },
 "07.04": {
  "descricao": "Demolição.",
  "cClassTrib": [
   "200046",
   "200045"
  ],
  "indOp": [
   "020201",
   "020202"
  ],
  "nbs": [
   "101031000"
  ]
 },
 "07.05": {
  "descricao": "Reparação, Conservação E Reforma De Edifícios, Estradas, Pontes, Portos E Congêneres (Exceto O Fornecimento De Mercadorias Produzidas Pelo Prestador Dos Serviços, Fora Do Local Da Prestação Dos Serviços, Que Fica Sujeito Ao ICMS).",
  "cClassTrib": [
   "200046",
   "200045",
   "200038"
  ],
  "indOp": [
   "020201",
   "020202"
  ],
  "nbs": [
   "101011100",
   "101011200",
   "101012100",
   "101012200",
   "101012900",
   "101013000",
   "101021100",
   "101021200",
   "101021300",
   "101022000",
   "101023100",
   "101023200",
   "101023300",
   "101023400",
   "101023510",
   "101023520",
   "101023530",
   "101024110",
   "101024120",
   "101024190",
   "101024210",
   "101024220",
   "101025100",
   "101025210",
   "101025220",
   "101025310",
   "101025320",
   "101026100",
   "101026900",
   "101027000",
   "101028000",
   "101029000",
   "101073000",
   "101079000"
  ]
 },
 "07.06": {
  "descricao": "Colocação E Instalação De Tapetes, Carpetes, Assoalhos, Cortinas, Revestimentos De Parede, Vidros, Divisórias, Placas De Gesso E Congêneres, Com Material Fornecido Pelo Tomador Do Serviço.",
  "cClassTrib": [
   "200046",
   "200045"
  ],
  "indOp": [
   "020201"
  ],
  "nbs": [
   "101065000",
   "101071000",
   "101072000",
   "101074000"
  ]
 },
 "07.07": {
  "descricao": "Recuperação, Raspagem, Polimento E Lustração De Pisos E Congêneres.",
  "cClassTrib": [
   "200046",
   "200045"
  ],
  "indOp": [
   "020201"
  ],
  "nbs": [
   "101074000"
  ]
 },
 "07.08": {
  "descricao": "Calafetação.",
  "cClassTrib": [
   "200046",
   "200045"
  ],
  "indOp": [
   "020201"
  ],
  "nbs": [
   "101079000"
  ]
 },
 "07.09": {
  "descricao": "Varrição, Coleta, Remoção, Incineração, Tratamento, Reciclagem, Separação E Destinação Final De Lixo, Rejeitos E Outros Resíduos Quaisquer.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "020202",
   "020201",
   "050101",
   "050102"
  ],
  "nbs": [
   "124061000",
   "124022000",
   "124031100",
   "124031200",
   "124031900",
   "124032100",
   "124032200",
   "124033100",
   "124033200",
   "124041100",
   "124041200",
   "124041300",
   "124041900",
   "124042100",
   "124042200",
   "124043100",
   "124043200",
   "124043900",
   "124043300"
  ]
 },
 "07.10": {
  "descricao": "Limpeza, Manutenção E Conservação De Vias E Logradouros Públicos, Imóveis, Chaminés, Piscinas, Parques, Jardins E Congêneres.",
  "cClassTrib": [
   "000001",
   "200045"
  ],
  "indOp": [
   "020201",
   "020202"
  ],
  "nbs": [
   "118031000",
   "118032200",
   "118032900",
   "124051400",
   "124069000",
   "124070000"
  ]
 },
 "07.11": {
  "descricao": "Decoração E Jardinagem, Inclusive Corte E Poda De Árvores.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "020201",
   "020202"
  ],
  "nbs": [
   "114091100",
   "114091200",
   "118067000"
  ]
 },
 "07.12": {
  "descricao": "Controle E Tratamento De Efluentes De Qualquer Natureza E De Agentes Físicos, Químicos E Biológicos.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301",
   "020202"
  ],
  "nbs": [
   "124051100",
   "124051200",
   "124051300",
   "124052000",
   "124059000"
  ]
 },
 "07.13": {
  "descricao": "Dedetização, Desinfecção, Desinsetização, Imunização, Higienização, Desratização, Pulverização E Congêneres.",
  "cClassTrib": [
   "000001",
   "200038"
  ],
  "indOp": [
   "020201"
  ],
  "nbs": [
   "118032100",
   "119011000"
  ]
 },
 "07.16": {
  "descricao": "Florestamento, Reflorestamento, Semeadura, Adubação, Reparação De Solo, Plantio, Silagem, Colheita, Corte E Descascamento De Árvores, Silvicultura, Exploração Florestal E Dos Serviços Congêneres Indissociáveis Da Formação, Manutenção E Colheita De Florestas, Para Quaisquer Fins E Por Quaisquer Meios. (Redação Dada Pela Lei Complementar Nº 157, De 2016)",
  "cClassTrib": [
   "000001",
   "200038",
   "200037"
  ],
  "indOp": [
   "020201",
   "100301",
   "050101",
   "050102"
  ],
  "nbs": [
   "111054100",
   "119011000",
   "119013000",
   "106023100"
  ]
 },
 "07.17": {
  "descricao": "Escoramento, Contenção De Encostas E Serviços Congêneres.",
  "cClassTrib": [
   "200046",
   "200045"
  ],
  "indOp": [
   "020202"
  ],
  "nbs": [
   "101051100"
  ]
 },
 "07.18": {
  "descricao": "Limpeza E Dragagem De Rios, Portos, Canais, Baías, Lagos, Lagoas, Represas, Açudes E Congêneres.",
  "cClassTrib": [
   "000001",
   "200045"
  ],
  "indOp": [
   "020202"
  ],
  "nbs": [
   "124069000"
  ]
 },
 "07.19": {
  "descricao": "Acompanhamento E Fiscalização Da Execução De Obras De Engenharia, Arquitetura E Urbanismo.",
  "cClassTrib": [
   "200052",
   "200045"
  ],
  "indOp": [
   "020201",
   "020202"
  ],
  "nbs": [
   "114021500",
   "114032110",
   "114032120",
   "114033000"
  ]
 },
 "07.20": {
  "descricao": "Aerofotogrametria (Inclusive Interpretação), Cartografia, Mapeamento, Levantamentos Topográficos, Batimétricos, Geográficos, Geodésicos, Geológicos, Geofísicos E Congêneres.",
  "cClassTrib": [
   "000001",
   "200045"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "114042100",
   "114042200",
   "114041900"
  ]
 },
 "07.21": {
  "descricao": "Pesquisa, Perfuração, Cimentação, Mergulho, Perfilagem, Concretação, Testemunhagem, Pescaria, Estimulação E Outros Serviços Relacionados Com A Exploração E Explotação De Petróleo, Gás Natural E De Outros Recursos Minerais.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "020202"
  ],
  "nbs": [
   "114041900",
   "119021000",
   "119029000"
  ]
 },
 "07.22": {
  "descricao": "Nucleação E Bombardeamento De Nuvens E Congêneres.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "119011000"
  ]
 },
 "08.01": {
  "descricao": "Ensino Regular Pré-Escolar, Fundamental, Médio E Superior.",
  "cClassTrib": [
   "200028",
   "200025"
  ],
  "indOp": [
   "030101",
   "030102",
   "100301"
  ],
  "nbs": [
   "122011100",
   "122011200",
   "122011900",
   "122012000",
   "122013000",
   "122020000",
   "122031000",
   "122032000",
   "122041000",
   "122042000",
   "122043000",
   "122044000"
  ]
 },
 "08.02": {
  "descricao": "Instrução, Treinamento, Orientação Pedagógica E Educacional, Avaliação De Conhecimentos De Qualquer Natureza.",
  "cClassTrib": [
   "000001",
   "200028"
  ],
  "indOp": [
   "030101",
   "030102",
   "100301"
  ],
  "nbs": [
   "122051100",
   "122051300",
   "122051900",
   "122052000"
  ]
 },
 "09.01": {
  "descricao": "Hospedagem De Qualquer Natureza Em Hotéis, Apart-Service Condominiais, Flat, Apart-Hotéis, Hotéis Residência, Residence-Service, Suite Service, Hotelaria Marítima, Motéis, Pensões E Congêneres; Ocupação Por Temporada Com Fornecimento De Serviço (O Valor Da Alimentação E Gorjeta, Quando Incluído No Preço Da Diária, Fica Sujeito Ao Imposto Sobre Serviços).",
  "cClassTrib": [
   "200048"
  ],
  "indOp": [
   "030101"
  ],
  "nbs": [
   "103031100",
   "103031200",
   "103031300",
   "103031400",
   "103032000",
   "103039000",
   "103041000",
   "103042000",
   "103049000"
  ]
 },
 "09.02": {
  "descricao": "Agenciamento, Organização, Promoção, Intermediação E Execução De Programas De Turismo, Passeios, Viagens, Excursões, Hospedagens E Congêneres.",
  "cClassTrib": [
   "200051"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "104011710",
   "104011720",
   "104011790",
   "104012300",
   "104014300",
   "104021320",
   "118054000",
   "118051100",
   "118051200",
   "118051300",
   "118051400",
   "118051900",
   "118052100",
   "118052200",
   "118052300",
   "118052400",
   "118053100",
   "118053200",
   "118053900",
   "118056100",
   "118056200"
  ]
 },
 "09.03": {
  "descricao": "Guias De Turismo.",
  "cClassTrib": [
   "200051"
  ],
  "indOp": [
   "030101",
   "030102",
   "100301"
  ],
  "nbs": [
   "118055000"
  ]
 },
 "10.01": {
  "descricao": "Agenciamento, Corretagem Ou Intermediação De Câmbio, De Seguros, De Cartões De Crédito, De Planos De Saúde E De Planos De Previdência Privada.",
  "cClassTrib": [
   "010002",
   "820007",
   "011003",
   "820001",
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "109061100",
   "109061200",
   "109102000",
   "109059000"
  ]
 },
 "10.02": {
  "descricao": "Agenciamento, Corretagem Ou Intermediação De Títulos Em Geral, Valores Mobiliários E Contratos Quaisquer.",
  "cClassTrib": [
   "820007",
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "109051100",
   "109051200"
  ]
 },
 "10.03": {
  "descricao": "Agenciamento, Corretagem Ou Intermediação De Direitos De Propriedade Industrial, Artística Ou Literária.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "125014000",
   "109051100"
  ]
 },
 "10.04": {
  "descricao": "Agenciamento, Corretagem Ou Intermediação De Contratos De Arrendamento Mercantil (Leasing), De Franquia (Franchising) E De Faturização (Factoring).",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "109059000"
  ]
 },
 "10.05": {
  "descricao": "Agenciamento, Corretagem Ou Intermediação De Bens Móveis Ou Imóveis, Não Abrangidos Em Outros Itens Ou Subitens, Inclusive Aqueles Realizados No Âmbito De Bolsas De Mercadorias E Futuros, Por Quaisquer Meios.",
  "cClassTrib": [
   "200046",
   "000001"
  ],
  "indOp": [
   "020301",
   "100301"
  ],
  "nbs": [
   "110012100",
   "110012200",
   "102010000",
   "102050000",
   "106070000",
   "109051200"
  ]
 },
 "10.06": {
  "descricao": "Agenciamento Marítimo.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "106070000"
  ]
 },
 "10.07": {
  "descricao": "Agenciamento De Notícias.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "117041000",
   "117042000"
  ]
 },
 "10.08": {
  "descricao": "Agenciamento De Publicidade E Propaganda, Inclusive O Agenciamento De Veiculação Por Quaisquer Meios.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "114062000"
  ]
 },
 "10.09": {
  "descricao": "Representação De Qualquer Natureza, Inclusive Comercial.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "102010000"
  ]
 },
 "10.10": {
  "descricao": "Distribuição De Bens De Terceiros.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "102010000"
  ]
 },
 "11.01": {
  "descricao": "Guarda E Estacionamento De Veículos Terrestres Automotores, De Aeronaves E De Embarcações.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "050101",
   "050102"
  ],
  "nbs": [
   "106043000",
   "106059000",
   "106061900"
  ]
 },
 "11.02": {
  "descricao": "Vigilância, Segurança Ou Monitoramento De Bens E Pessoas.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "030101",
   "030102",
   "100301"
  ],
  "nbs": [
   "118025000",
   "118022000",
   "118023000",
   "118029000"
  ]
 },
 "11.03": {
  "descricao": "Escolta, Inclusive De Veículos E Cargas.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "030101",
   "030102",
   "100301"
  ],
  "nbs": [
   "118025000"
  ]
 },
 "11.04": {
  "descricao": "Armazenamento, Depósito, Carga, Descarga, Arrumação E Guarda De Bens De Qualquer Espécie.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "050101",
   "050102"
  ],
  "nbs": [
   "106011000",
   "106019000",
   "106021000",
   "106022100",
   "106022200",
   "106022300",
   "106022900",
   "106023100",
   "106023200",
   "106023300",
   "106029000",
   "106082000",
   "106083000"
  ]
 },
 "11.05": {
  "descricao": "Vigilância, Segurança Ou Monitoramento De Bens, Pessoas E Semoventes. (Redação Dada Pela Lei Complementar Nº 157, De 2016)",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "118023000"
  ]
 },
 "12.01": {
  "descricao": "Espetáculos Teatrais.",
  "cClassTrib": [
   "200039",
   "000001"
  ],
  "indOp": [
   "040101"
  ],
  "nbs": [
   "125022000"
  ]
 },
 "12.02": {
  "descricao": "Exibições Cinematográficas.",
  "cClassTrib": [
   "200039",
   "000001"
  ],
  "indOp": [
   "030101",
   "030102"
  ],
  "nbs": [
   "125015000"
  ]
 },
 "12.03": {
  "descricao": "Espetáculos Circenses.",
  "cClassTrib": [
   "200039",
   "000001"
  ],
  "indOp": [
   "040101"
  ],
  "nbs": [
   "125022000"
  ]
 },
 "12.04": {
  "descricao": "Programas De Auditório.",
  "cClassTrib": [
   "200039",
   "000001"
  ],
  "indOp": [
   "040101"
  ],
  "nbs": [
   "125029000"
  ]
 },
 "12.05": {
  "descricao": "Parques De Diversões, Centros De Lazer E Congêneres.",
  "cClassTrib": [
   "200048"
  ],
  "indOp": [
   "030101"
  ],
  "nbs": [
   "125042100",
   "125042200",
   "125071000",
   "125079000"
  ]
 },
 "12.06": {
  "descricao": "Boates, taxi-dancing e congêneres.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "030101",
   "030102"
  ],
  "nbs": [
   "125080000"
  ]
 },
 "12.07": {
  "descricao": "Shows, ballet, danças, desfiles, bailes, óperas, concertos, recitais, festivais e congêneres.",
  "cClassTrib": [
   "200039",
   "000001"
  ],
  "indOp": [
   "040101"
  ],
  "nbs": [
   "125022000",
   "125029000"
  ]
 },
 "12.08": {
  "descricao": "Feiras, exposições, congressos e congêneres.",
  "cClassTrib": [
   "200039",
   "000001"
  ],
  "indOp": [
   "040101"
  ],
  "nbs": [
   "118066100",
   "118066200",
   "118066300"
  ]
 },
 "12.09": {
  "descricao": "Bilhares, boliches e diversões eletrônicas ou não.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "030101",
   "030102"
  ],
  "nbs": [
   "125059000",
   "125080000"
  ]
 },
 "12.10": {
  "descricao": "Corridas e competições de animais.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "030101",
   "030102"
  ],
  "nbs": [
   "125080000",
   "125051000"
  ]
 },
 "12.11": {
  "descricao": "Competições esportivas ou de destreza física ou intelectual, com ou sem a participação do espectador.",
  "cClassTrib": [
   "200042",
   "000001"
  ],
  "indOp": [
   "030101",
   "030102"
  ],
  "nbs": [
   "125052000",
   "125059000",
   "125051000"
  ]
 },
 "12.12": {
  "descricao": "Execução de música.",
  "cClassTrib": [
   "200039",
   "000001"
  ],
  "indOp": [
   "030101",
   "030102",
   "100301"
  ],
  "nbs": [
   "125031000"
  ]
 },
 "12.13": {
  "descricao": "Produção, mediante ou sem encomenda prévia, de eventos, espetáculos, entrevistas, shows, ballet , danças, desfiles, bailes, teatros, óperas, concertos, recitais, festivais e congêneres, inclusive programas de televisão, matérias jornalísticas ou publicitárias.",
  "cClassTrib": [
   "200039",
   "000001"
  ],
  "indOp": [
   "040101"
  ],
  "nbs": [
   "125012100",
   "125012200",
   "125021000",
   "125022000",
   "125023000",
   "125051000"
  ]
 },
 "12.14": {
  "descricao": "Fornecimento de música para ambientes fechados ou não, mediante transmissão por qualquer processo.",
  "cClassTrib": [
   "200039",
   "000001"
  ],
  "indOp": [
   "030101",
   "030102",
   "100301"
  ],
  "nbs": [
   "125029000"
  ]
 },
 "12.15": {
  "descricao": "Desfiles de blocos carnavalescos ou folclóricos, trios elétricos e congêneres.",
  "cClassTrib": [
   "200039",
   "000001"
  ],
  "indOp": [
   "040101"
  ],
  "nbs": [
   "125029000",
   "125022000"
  ]
 },
 "12.16": {
  "descricao": "Exibição de filmes, entrevistas, musicais, espetáculos, shows, concertos, desfiles, óperas, competições esportivas, de destreza intelectual ou congêneres.",
  "cClassTrib": [
   "200039",
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "125015000",
   "125029000",
   "125051000"
  ]
 },
 "12.17": {
  "descricao": "Recreação e animação, inclusive em festas e eventos de qualquer natureza.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "030101",
   "030102"
  ],
  "nbs": [
   "125080000"
  ]
 },
 "13.02": {
  "descricao": "Fonografia ou gravação de sons, inclusive trucagem, dublagem, mixagem e congêneres.",
  "cClassTrib": [
   "200039",
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "125011100",
   "125011200",
   "125013600",
   "125013700",
   "125013900"
  ]
 },
 "13.03": {
  "descricao": "Fotografia e cinematografia, inclusive revelação, ampliação, cópia, reprodução, trucagem e congêneres.",
  "cClassTrib": [
   "000001",
   "200039"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "114081100",
   "114081200",
   "114081300",
   "114081400",
   "114081500",
   "114081900",
   "114082000",
   "121012300",
   "125013100",
   "125013200",
   "125013300",
   "125013400",
   "125013500",
   "125013600",
   "125013900",
   "125019000"
  ]
 },
 "13.04": {
  "descricao": "Reprografia, microfilmagem e digitalização.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "118065100"
  ]
 },
 "13.05": {
  "descricao": "Composição Gráfica, Inclusive Confecção De Impressos Gráficos, Fotocomposição, Clicheria, Zincografia, Litografia E Fotolitografia, Exceto Se Destinados A Posterior Operação De Comercialização Ou Industrialização, Ainda Que Incorporados, De Qualquer Forma, A Outra Mercadoria Que Deva Ser Objeto De Posterior Circulação, Tais Como Bulas, Rótulos, Etiquetas, Caixas, Cartuchos, Embalagens E Manuais Técnicos E De Instrução, Quando Ficarão Sujeitos Ao ICMS.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "121011000",
   "121012100",
   "121012200"
  ]
 },
 "14.01": {
  "descricao": "Lubrificação, limpeza, lustração, revisão, carga e recarga, conserto, restauração, blindagem, manutenção e conservação de máquinas, veículos, aparelhos, equipamentos, motores, elevadores ou de qualquer objeto (exceto peças e partes empregadas, que ficam sujeitas ao ICMS).",
  "cClassTrib": [
   "000001",
   "200044"
  ],
  "indOp": [
   "050101",
   "050102"
  ],
  "nbs": [
   "120011000",
   "120012000",
   "120013110",
   "120013120",
   "120013200",
   "120013300",
   "120013410",
   "120013420",
   "120013430",
   "120013500",
   "120013900",
   "120014000",
   "120015000",
   "120016000",
   "120017000",
   "120018100",
   "120018200",
   "120018300",
   "120018900",
   "120021000",
   "120022000",
   "120023000",
   "120024000",
   "120029000",
   "118032900"
  ]
 },
 "14.02": {
  "descricao": "Assistência técnica.",
  "cClassTrib": [
   "000001",
   "200044"
  ],
  "indOp": [
   "050101",
   "050102"
  ],
  "nbs": [
   "120011000",
   "120012000",
   "120013110",
   "120013120",
   "120013200",
   "120013300",
   "120013410",
   "120013420",
   "120013430",
   "120013500",
   "120013900",
   "120014000",
   "120015000",
   "120016000",
   "120017000",
   "120018100",
   "120018200",
   "120018300",
   "120018900",
   "120021000",
   "120022000",
   "120023000",
   "120024000",
   "120029000"
  ]
 },
 "14.03": {
  "descricao": "Recondicionamento de motores (exceto peças e partes empregadas, que ficam sujeitas ao ICMS).",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "050101",
   "050102"
  ],
  "nbs": [
   "120013110",
   "120018900"
  ]
 },
 "14.04": {
  "descricao": "Recauchutagem ou regeneração de pneus.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "050101",
   "050102"
  ],
  "nbs": [
   "120029000"
  ]
 },
 "14.05": {
  "descricao": "Restauração, Recondicionamento, Acondicionamento, Pintura, Beneficiamento, Lavagem, Secagem, Tingimento, Galvanoplastia, Anodização, Corte, Recorte, Plastificação, Costura, Acabamento, Polimento E Congêneres De Objetos Quaisquer. (Redação Dada Pela Lei Complementar Nº 157, De 2016)",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "050101",
   "050102"
  ],
  "nbs": [
   "118040000",
   "120029000"
  ]
 },
 "14.06": {
  "descricao": "Instalação E Montagem De Aparelhos, Máquinas E Equipamentos, Inclusive Montagem Industrial, Prestados Ao Usuário Final, Exclusivamente Com Material Por Ele Fornecido.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "050101",
   "050102"
  ],
  "nbs": [
   "101061200",
   "101061300",
   "101061400",
   "101063100",
   "101063200",
   "101064000",
   "101069000",
   "101076000",
   "120031000",
   "120032110",
   "120032190",
   "120032200",
   "120032300",
   "120032400",
   "120032510",
   "120032520",
   "120032610",
   "120032690",
   "120032900",
   "101061900",
   "101066000"
  ]
 },
 "14.07": {
  "descricao": "Colocação de molduras e congêneres.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "050101",
   "050102"
  ],
  "nbs": [
   "126060000"
  ]
 },
 "14.08": {
  "descricao": "Encadernação, gravação e douração de livros, revistas e congêneres.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "050101",
   "050102"
  ],
  "nbs": [
   "121012200"
  ]
 },
 "14.09": {
  "descricao": "Alfaiataria e costura, quando o material for fornecido pelo usuário final, exceto aviamento.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "050101",
   "050102"
  ],
  "nbs": [
   "126040000",
   "120024000"
  ]
 },
 "14.10": {
  "descricao": "Tinturaria e lavanderia.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "050101",
   "050102"
  ],
  "nbs": [
   "126011000",
   "126012000",
   "126013000",
   "126014000",
   "126019000"
  ]
 },
 "14.11": {
  "descricao": "Tapeçaria e reforma de estofamentos em geral.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "050101",
   "050102"
  ],
  "nbs": [
   "120024000"
  ]
 },
 "14.12": {
  "descricao": "Funilaria e lanternagem.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "050101",
   "050102"
  ],
  "nbs": [
   "120013110"
  ]
 },
 "14.13": {
  "descricao": "Carpintaria e serralheria.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "050101",
   "050102"
  ],
  "nbs": [
   "101075000"
  ]
 },
 "14.14": {
  "descricao": "Guincho Intramunicipal, Guindaste E Içamento. (Redação Dada Pela Lei Complementar Nº 157, De 2016)",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "050101",
   "050102"
  ],
  "nbs": [
   "106044000",
   "106019000"
  ]
 },
 "15.01": {
  "descricao": "Administração De Fundos Quaisquer, De Consórcio, De Cartão De Crédito Ou Débito E Congêneres, De Carteira De Clientes, De Cheques Pré-Datados E Congêneres.",
  "cClassTrib": [
   "820007"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "109014000",
   "109052100",
   "109052200",
   "109052300",
   "109054000",
   "109064000"
  ]
 },
 "15.02": {
  "descricao": "Abertura De Contas Em Geral, Inclusive Conta-Corrente, Conta De Investimentos E Aplicação E Caderneta De Poupança, No País E No Exterior, Bem Como A Manutenção Das Referidas Contas Ativas E Inativas.",
  "cClassTrib": [
   "820007"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "109012100",
   "109012200",
   "109012900"
  ]
 },
 "15.03": {
  "descricao": "Locação E Manutenção De Cofres Particulares, De Terminais Eletrônicos, De Terminais De Atendimento E De Bens E Equipamentos Em Geral.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "010101",
   "050101",
   "050102"
  ],
  "nbs": [
   "111019000",
   "120018900"
  ]
 },
 "15.04": {
  "descricao": "Fornecimento Ou Emissão De Atestados Em Geral, Inclusive Atestado De Idoneidade, Atestado De Capacidade Financeira E Congêneres.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "113013000",
   "118061000"
  ]
 },
 "15.05": {
  "descricao": "Cadastro, Elaboração De Ficha Cadastral, Renovação Cadastral E Congêneres, Inclusão Ou Exclusão No Cadastro De Emitentes De Cheques Sem Fundos",
  "cClassTrib": [
   "000001",
   "820007"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "118061000"
  ]
 },
 "15.06": {
  "descricao": "Emissão, Reemissão E Fornecimento De Avisos, Comprovantes E Documentos Em Geral; Abono De Firmas; Coleta E Entrega De Documentos, Bens E Valores; Comunicação Com Outra Agência Ou Com A Administração Central; Licenciamento Eletrônico De Veículos; Transferência De Veículos; Agenciamento Fiduciário Ou Depositário; Devolução De Bens Em Custódia.",
  "cClassTrib": [
   "000001",
   "820007"
  ],
  "indOp": [
   "100301",
   "070101"
  ],
  "nbs": [
   "113013000",
   "107020000",
   "109053000",
   "109058000",
   "109059000"
  ]
 },
 "15.07": {
  "descricao": "Acesso, Movimentação, Atendimento E Consulta A Contas Em Geral, Por Qualquer Meio Ou Processo, Inclusive Por Telefone, Fac-Símile, Internet E Telex, Acesso A Terminais De Atendimento, Inclusive Vinte E Quatro Horas; Acesso A Outro Banco E A Rede Compartilhada; Fornecimento De Saldo, Extrato E Demais Informações Relativas A Contas Em Geral, Por Qualquer Meio Ou Processo.",
  "cClassTrib": [
   "820007"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "109019000",
   "118063100"
  ]
 },
 "15.08": {
  "descricao": "Emissão, Reemissão, Alteração, Cessão, Substituição, Cancelamento E Registro De Contrato De Crédito; Estudo, Análise E Avaliação De Operações De Crédito; Emissão, Concessão, Alteração Ou Contratação De Aval, Fiança, Anuência E Congêneres; Serviços Relativos A Abertura De Crédito, Para Quaisquer Fins.",
  "cClassTrib": [
   "820007"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "109013300",
   "109013400",
   "109013500",
   "109013600",
   "109013900",
   "109055000"
  ]
 },
 "15.09": {
  "descricao": "Arrendamento Mercantil (Leasing) De Quaisquer Bens, Inclusive Cessão De Direitos E Obrigações, Substituição De Garantia, Alteração, Cancelamento E Registro De Contrato, E Demais Serviços Relacionados Ao Arrendamento Mercantil (Leasing).",
  "cClassTrib": [
   "820007"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "109015111",
   "109015112",
   "109015113",
   "109015114",
   "109015115",
   "109015116",
   "109015117",
   "109015121",
   "109015122",
   "109015123",
   "109015124",
   "109015125",
   "109015129",
   "109015210",
   "109015220",
   "109015230",
   "109015240",
   "109015250",
   "109015290",
   "111011100",
   "111011200",
   "111011300",
   "111011400",
   "111011500",
   "111011600",
   "111011700",
   "111012000",
   "111013000",
   "111014000",
   "111015000",
   "111016000",
   "111019000",
   "111021000",
   "111022000",
   "111023000",
   "111024000",
   "111025000",
   "111026000",
   "111029000"
  ]
 },
 "15.10": {
  "descricao": "Serviços Relacionados A Cobranças, Recebimentos Ou Pagamentos Em Geral, De Títulos Quaisquer, De Contas Ou Carnês, De Câmbio, De Tributos E Por Conta De Terceiros, Inclusive Os Efetuados Por Meio Eletrônico, Automático Ou Por Máquinas De Atendimento; Fornecimento De Posição De Cobrança, Recebimento Ou Pagamento; Emissão De Carnês, Fichas De Compensação, Impressos E Documentos Em Geral.",
  "cClassTrib": [
   "000001",
   "820007"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "118062000",
   "109019000"
  ]
 },
 "15.11": {
  "descricao": "Devolução De Títulos, Protesto De Títulos, Sustação De Protesto, Manutenção De Títulos, Reapresentação De Títulos, E Demais Serviços A Eles Relacionados.",
  "cClassTrib": [
   "820007"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "109019000"
  ]
 },
 "15.12": {
  "descricao": "Custódia Em Geral, Inclusive De Títulos E Valores Mobiliários.",
  "cClassTrib": [
   "820007"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "109053000"
  ]
 },
 "15.13": {
  "descricao": "Serviços Relacionados A Operações De Câmbio Em Geral, Edição, Alteração, Prorrogação, Cancelamento E Baixa De Contrato De Câmbio; Emissão De Registro De Exportação Ou De Crédito; Cobrança Ou Depósito No Exterior; Emissão, Fornecimento E Cancelamento De Cheques De Viagem; Fornecimento, Transferência, Cancelamento E Demais Serviços Relativos A Carta De Crédito De Importação, Exportação E Garantias Recebidas; Envio E Recebimento De Mensagens Em Geral Relacionadas A Operações De Câmbio.",
  "cClassTrib": [
   "000001",
   "820007"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "109056000"
  ]
 },
 "15.14": {
  "descricao": "Fornecimento, Emissão, Reemissão, Renovação E Manutenção De Cartão Magnético, Cartão De Crédito, Cartão De Débito, Cartão Salário E Congêneres.",
  "cClassTrib": [
   "820007"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "109014000",
   "109019000"
  ]
 },
 "15.15": {
  "descricao": "Compensação De Cheques E Títulos Quaisquer; Serviços Relacionados A Depósito, Inclusive Depósito Identificado, A Saque De Contas Quaisquer, Por Qualquer Meio Ou Processo, Inclusive Em Terminais Eletrônicos E De Atendimento.",
  "cClassTrib": [
   "820007"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "109012100",
   "109012200",
   "109012900",
   "109051300"
  ]
 },
 "15.16": {
  "descricao": "Emissão, Reemissão, Liquidação, Alteração, Cancelamento E Baixa De Ordens De Pagamento, Ordens De Crédito E Similares, Por Qualquer Meio Ou Processo; Serviços Relacionados À Transferência De Valores, Dados, Fundos, Pagamentos E Similares, Inclusive Entre Contas Em Geral.",
  "cClassTrib": [
   "000001",
   "820007"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "109019000"
  ]
 },
 "15.17": {
  "descricao": "Emissão, Fornecimento, Devolução, Sustação, Cancelamento E Oposição De Cheques Quaisquer, Avulso Ou Por Talão.",
  "cClassTrib": [
   "820007"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "109019000"
  ]
 },
 "15.18": {
  "descricao": "Serviços Relacionados A Crédito Imobiliário, Avaliação E Vistoria De Imóvel Ou Obra, Análise Técnica E Jurídica, Emissão, Reemissão, Alteração, Transferência E Renegociação De Contrato, Emissão E Reemissão Do Termo De Quitação E Demais Serviços Relacionados A Crédito Imobiliário.",
  "cClassTrib": [
   "820007"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "109013100",
   "109013200",
   "110013000"
  ]
 },
 "16.01": {
  "descricao": "Serviços De Transporte Coletivo Municipal Rodoviário, Metroviário, Ferroviário E Aquaviário De Passageiros. (Redação Dada Pela Lei Complementar Nº 157, De 2016)",
  "cClassTrib": [
   "400001",
   "200021",
   "000001"
  ],
  "indOp": [
   "060101"
  ],
  "nbs": [
   "104011119",
   "104011610",
   "104011620",
   "104011690",
   "104012110",
   "104012190",
   "104013000"
  ]
 },
 "16.02": {
  "descricao": "Outros Serviços De Transporte De Natureza Municipal. (Incluído Pela Lei Complementar Nº 157, De 2016)",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "060101",
   "070101",
   "130101",
   "130201"
  ],
  "nbs": [
   "104012190",
   "104011111",
   "104011210",
   "104011220",
   "104011290",
   "104011300",
   "104011400",
   "104011510",
   "104011520",
   "104011900",
   "104012120",
   "104012200",
   "104012900",
   "104014100",
   "104014200",
   "104014900",
   "104019000",
   "104041000",
   "104042000",
   "104043000",
   "104050000",
   "105011110",
   "105011120",
   "105011130",
   "105011210",
   "105011220",
   "105011230",
   "105011310",
   "105011320",
   "105011410",
   "105011420",
   "105011430",
   "105011440",
   "105011451",
   "105011452",
   "105011459",
   "105011500",
   "105011900",
   "105013100",
   "105021110",
   "105021120",
   "105021130",
   "105021210",
   "105021220",
   "105021230",
   "105021310",
   "105021320",
   "105021410",
   "105021420",
   "105021430",
   "105021440",
   "105021451",
   "105021452",
   "105021459",
   "105021490",
   "105021900",
   "105022110",
   "105022120",
   "105022130",
   "105022210",
   "105022220",
   "105022230",
   "105022310",
   "105022320",
   "105022410",
   "105022420",
   "105022430",
   "105022440",
   "105022451",
   "105022452",
   "105022459",
   "105022900",
   "105051000",
   "105052000",
   "105053000"
  ]
 },
 "17.01": {
  "descricao": "Assessoria Ou Consultoria De Qualquer Natureza, Não Contida Em Outros Itens Desta Lista; Análise, Exame, Pesquisa, Coleta, Compilação E Fornecimento De Dados E Informações De Qualquer Natureza, Inclusive Cadastro E Similares.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "106084000",
   "110014000",
   "110015000",
   "110019000",
   "113013000",
   "113031000",
   "113032000",
   "114011100",
   "114011300",
   "114011400",
   "114011500",
   "114011600",
   "114011700",
   "114011800",
   "114011900",
   "114013900",
   "114101000",
   "114109000",
   "114120000",
   "114130000",
   "114140000",
   "114070000",
   "118061000"
  ]
 },
 "17.02": {
  "descricao": "Datilografia, Digitação, Estenografia, Expediente, Secretaria Em Geral, Resposta Audível, Redação, Edição, Interpretação, Revisão, Tradução, Apoio E Infra-Estrutura Administrativa E Congêneres.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "114110000",
   "118063100",
   "118063900",
   "118064000",
   "118065200",
   "118065300",
   "118065900"
  ]
 },
 "17.03": {
  "descricao": "Planejamento, Coordenação, Programação Ou Organização Técnica, Financeira Ou Administrativa.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "114012900",
   "114013900"
  ]
 },
 "17.04": {
  "descricao": "Recrutamento, Agenciamento, Seleção E Colocação De Mão-De-Obra.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "118011100",
   "118011200"
  ]
 },
 "17.05": {
  "descricao": "Fornecimento De Mão-De-Obra, Mesmo Em Caráter Temporário, Inclusive De Empregados Ou Trabalhadores, Avulsos Ou Temporários, Contratados Pelo Prestador De Serviço.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "118012100",
   "118012200",
   "118012900"
  ]
 },
 "17.06": {
  "descricao": "Propaganda E Publicidade, Inclusive Promoção De Vendas, Planejamento De Campanhas Ou Sistemas De Publicidade, Elaboração De Desenhos, Textos E Demais Materiais Publicitários.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "114061100",
   "114061200",
   "114061900",
   "114070000"
  ]
 },
 "17.08": {
  "descricao": "Franquia (Franchising).",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "111100000"
  ]
 },
 "17.09": {
  "descricao": "Perícias, Laudos, Exames Técnicos E Análises Técnicas.",
  "cClassTrib": [
   "000001",
   "200038"
  ],
  "indOp": [
   "050101",
   "050102"
  ],
  "nbs": [
   "114044100",
   "114044200",
   "114044300",
   "114044400",
   "114044900"
  ]
 },
 "17.10": {
  "descricao": "Planejamento, Organização E Administração De Feiras, Exposições, Congressos E Congêneres.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "040101"
  ],
  "nbs": [
   "118066100",
   "118066200",
   "118066300"
  ]
 },
 "17.11": {
  "descricao": "Organização De Festas E Recepções; Bufê (Exceto O Fornecimento De Alimentação E Bebidas, Que Fica Sujeito Ao ICMS).",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301",
   "030101",
   "030102"
  ],
  "nbs": [
   "118066300",
   "103011000",
   "103013100",
   "103013900"
  ]
 },
 "17.12": {
  "descricao": "Administração Em Geral, Inclusive De Bens E Negócios De Terceiros.",
  "cClassTrib": [
   "200046",
   "000001"
  ],
  "indOp": [
   "020301",
   "100301"
  ],
  "nbs": [
   "110011100",
   "110011290",
   "114012100",
   "114012200"
  ]
 },
 "17.13": {
  "descricao": "Leilão E Congêneres.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "118069000"
  ]
 },
 "17.14": {
  "descricao": "Advocacia.",
  "cClassTrib": [
   "200052"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "113011000",
   "113012000",
   "113019000",
   "113031000",
   "113032000"
  ]
 },
 "17.15": {
  "descricao": "Arbitragem De Qualquer Espécie, Inclusive Jurídica.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "113014000"
  ]
 },
 "17.16": {
  "descricao": "Auditoria.",
  "cClassTrib": [
   "200052",
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "113021100",
   "113021900"
  ]
 },
 "17.17": {
  "descricao": "Análise De Organização E Métodos.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "118069000"
  ]
 },
 "17.18": {
  "descricao": "Atuária E Cálculos Técnicos De Qualquer Natureza.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "109063000"
  ]
 },
 "17.19": {
  "descricao": "Contabilidade, Inclusive Serviços Técnicos E Auxiliares.",
  "cClassTrib": [
   "200052"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "113022100",
   "113022200",
   "113022300"
  ]
 },
 "17.20": {
  "descricao": "Consultoria E Assessoria Econômica Ou Financeira.",
  "cClassTrib": [
   "200052"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "109055000",
   "109057000",
   "109058000",
   "114011200"
  ]
 },
 "17.21": {
  "descricao": "Estatística.",
  "cClassTrib": [
   "200052"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "114150000"
  ]
 },
 "17.22": {
  "descricao": "Cobrança Em Geral.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "118062000"
  ]
 },
 "17.23": {
  "descricao": "Assessoria, Análise, Avaliação, Atendimento, Consulta, Cadastro, Seleção, Gerenciamento De Informações, Administração De Contas A Receber Ou A Pagar E Em Geral, Relacionados A Operações De Faturização (Factoring).",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "109080000"
  ]
 },
 "17.24": {
  "descricao": "Apresentação De Palestras, Conferências, Seminários E Congêneres.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "030101",
   "030102",
   "100301"
  ],
  "nbs": [
   "122051400"
  ]
 },
 "17.25": {
  "descricao": "Inserção De Textos, Desenhos E Outros Materiais De Propaganda E Publicidade, Em Qualquer Meio (Exceto Em Livros, Jornais, Periódicos E Nas Modalidades De Serviços De Radiodifusão Sonora E De Sons E Imagens De Recepção Livre E Gratuita).(Incluído Pela Lei Complementar Nº 157, De 2016)",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100101"
  ],
  "nbs": [
   "114063300",
   "114063400",
   "114063900"
  ]
 },
 "18.01": {
  "descricao": "Serviços De Regulação De Sinistros Vinculados A Contratos De Seguros; Inspeção E Avaliação De Riscos Para Cobertura De Contratos De Seguros; Prevenção E Gerência De Riscos Seguráveis E Congêneres.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "109062000"
  ]
 },
 "19.01": {
  "descricao": "Serviços De Distribuição E Venda De Bilhetes E Demais Produtos De Loteria, Bingos, Cartões, Pules Ou Cupons De Apostas, Sorteios, Prêmios, Inclusive Os Decorrentes De Títulos De Capitalização E Congêneres.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "109051100"
  ]
 },
 "20.01": {
  "descricao": "Serviços Portuários, Ferroportuários, Utilização De Porto, Movimentação De Passageiros, Reboque De Embarcações, Rebocador Escoteiro, Atracação, Desatracação, Serviços De Praticagem, Capatazia, Armazenagem De Qualquer Natureza, Serviços Acessórios, Movimentação De Mercadorias, Serviços De Apoio Marítimo, De Movimentação Ao Largo, Serviços De Armadores, Estiva, Conferência, Logística E Congêneres.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "050201"
  ],
  "nbs": [
   "104012120",
   "106011000",
   "106019000",
   "106051000",
   "106052000",
   "106053000",
   "106054000",
   "106059000",
   "106021000",
   "106022100",
   "106022200",
   "106022300",
   "106022900",
   "106023100",
   "106023200",
   "106023300",
   "106029000"
  ]
 },
 "20.02": {
  "descricao": "Serviços Aeroportuários, Utilização De Aeroporto, Movimentação De Passageiros, Armazenagem De Qualquer Natureza, Capatazia, Movimentação De Aeronaves, Serviços De Apoio Aeroportuários, Serviços Acessórios, Movimentação De Mercadorias, Logística E Congêneres.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "050101",
   "100301",
   "030101"
  ],
  "nbs": [
   "106019000",
   "106029000",
   "106061100",
   "106061200",
   "106061900",
   "106062000"
  ]
 },
 "20.03": {
  "descricao": "Serviços De Terminais Rodoviários, Ferroviários, Metroviários, Movimentação De Passageiros, Mercadorias, Inclusive Suas Operações, Logística E Congêneres.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "050101",
   "100301"
  ],
  "nbs": [
   "106019000",
   "106030000",
   "106041000",
   "106049000"
  ]
 },
 "21.01": {
  "descricao": "Serviços De Registros Públicos, Cartorários E Notariais.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301",
   "030101",
   "030102"
  ],
  "nbs": [
   "113040000"
  ]
 },
 "22.01": {
  "descricao": "Serviços De Exploração De Rodovia Mediante Cobrança De Preço Ou Pedágio Dos Usuários, Envolvendo Execução De Serviços De Conservação, Manutenção, Melhoramentos Para Adequação De Capacidade E Segurança De Trânsito, Operação, Monitoração, Assistência Aos Usuários E Outros Serviços Definidos Em Contratos, Atos De Concessão Ou De Permissão Ou Em Normas Oficiais.",
  "cClassTrib": [
   "820006"
  ],
  "indOp": [
   "080101"
  ],
  "nbs": [
   "106042100",
   "106042200"
  ]
 },
 "23.01": {
  "descricao": "Serviços De Programação E Comunicação Visual, Desenho Industrial E Congêneres.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "114092100",
   "114092200",
   "114092300",
   "114092400",
   "114092500",
   "114092900",
   "114093000",
   "114099000"
  ]
 },
 "24.01": {
  "descricao": "Serviços De Chaveiros, Confecção De Carimbos, Placas, Sinalização Visual, Banners, Adesivos E Congêneres.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "050101",
   "050102",
   "100301"
  ],
  "nbs": [
   "126060000"
  ]
 },
 "25.01": {
  "descricao": "Funerais, Inclusive Fornecimento De Caixão, Urna Ou Esquifes; Aluguel De Capela; Transporte Do Corpo Cadavérico; Fornecimento De Flores, Coroas E Outros Paramentos; Desembaraço De Certidão De Óbito; Fornecimento De Véu, Essa E Outros Adornos; Embalsamento, Embelezamento, Conservação Ou Restauração De Cadáveres.",
  "cClassTrib": [
   "000001",
   "200029"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "114053000",
   "126030000"
  ]
 },
 "25.02": {
  "descricao": "Translado Intramunicipal E Cremação De Corpos E Partes De Corpos Cadavéricos. (Redação Dada Pela Lei Complementar Nº 157, De 2016)",
  "cClassTrib": [
   "000001",
   "200029"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "114053000",
   "126030000"
  ]
 },
 "25.03": {
  "descricao": "Planos Ou Convênio Funerários.",
  "cClassTrib": [
   "011001",
   "820002"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "126030000"
  ]
 },
 "25.04": {
  "descricao": "Manutenção E Conservação De Jazigos E Cemitérios.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "020201"
  ],
  "nbs": [
   "126030000"
  ]
 },
 "25.05": {
  "descricao": "Cessão De Uso De Espaços Em Cemitérios Para Sepultamento. (Incluído Pela Lei Complementar Nº 157, De 2016)",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "020101"
  ],
  "nbs": [
   "126030000"
  ]
 },
 "26.01": {
  "descricao": "Serviços De Coleta, Remessa Ou Entrega De Correspondências, Documentos, Objetos, Bens Ou Valores, Inclusive Pelos Correios E Suas Agências Franqueadas; Courrier E Congêneres.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "070101"
  ],
  "nbs": [
   "105011500",
   "106081000",
   "107010000",
   "107020000",
   "107030000",
   "118024000"
  ]
 },
 "27.01": {
  "descricao": "Serviços De Assistência Social.",
  "cClassTrib": [
   "200052"
  ],
  "indOp": [
   "030101",
   "030102",
   "100301"
  ],
  "nbs": [
   "123041100",
   "123041200",
   "123041900",
   "123042000",
   "123049000"
  ]
 },
 "28.01": {
  "descricao": "Serviços De Avaliação De Bens E Serviços De Qualquer Natureza.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "114041400",
   "110013000",
   "109021000"
  ]
 },
 "29.01": {
  "descricao": "Serviços De Biblioteconomia.",
  "cClassTrib": [
   "000001",
   "200052"
  ],
  "indOp": [
   "030101",
   "100301"
  ],
  "nbs": [
   "117051000",
   "117052000",
   "114150000"
  ]
 },
 "30.01": {
  "descricao": "Serviços De Biologia, Biotecnologia E Química.",
  "cClassTrib": [
   "200052",
   "200038"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "114150000"
  ]
 },
 "31.01": {
  "descricao": "Serviços Técnicos Em Edificações, Eletrônica, Eletrotécnica, Mecânica, Telecomunicações E Congêneres.",
  "cClassTrib": [
   "200052"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "114150000"
  ]
 },
 "32.01": {
  "descricao": "Serviços De Desenhos Técnicos.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "114099000"
  ]
 },
 "33.01": {
  "descricao": "Serviços De Desembaraço Aduaneiro, Comissários, Despachantes E Congêneres.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "102040000",
   "126060000"
  ]
 },
 "34.01": {
  "descricao": "Serviços De Investigações Particulares, Detetives E Congêneres.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "118021000"
  ]
 },
 "35.01": {
  "descricao": "Serviços De Reportagem, Assessoria De Imprensa, Jornalismo E Relações Públicas.",
  "cClassTrib": [
   "000001",
   "200040",
   "200052"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "114013100",
   "114013200",
   "117041000",
   "117042000"
  ]
 },
 "36.01": {
  "descricao": "Serviços De Meteorologia.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "114043000"
  ]
 },
 "37.01": {
  "descricao": "Serviços De Artistas, Atletas, Modelos E Manequins.",
  "cClassTrib": [
   "000001",
   "200039"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "118068100",
   "118068200",
   "118068300",
   "125060000",
   "125031000"
  ]
 },
 "38.01": {
  "descricao": "Serviços De Museologia",
  "cClassTrib": [
   "200039",
   "000001",
   "200052"
  ],
  "indOp": [
   "030101",
   "020201",
   "100301"
  ],
  "nbs": [
   "125041100",
   "125041200",
   "114150000"
  ]
 },
 "39.01": {
  "descricao": "Serviços De Ourivesaria E Lapidação (Quando O Material For Fornecido Pelo Tomador Do Serviço).",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "050101",
   "050102"
  ],
  "nbs": [
   "120022000"
  ]
 },
 "40.01": {
  "descricao": "Obras De Arte Sob Encomenda.",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "111099000",
   "125032000"
  ]
 },
 "99.01.01": {
  "descricao": "Outros serviços sem a incidência de ISSQN e ICMS.",
  "cClassTrib": [],
  "indOp": [],
  "nbs": []
 },
 "99.02.01": {
  "descricao": "Operação com Bens Imateriais não classificados em itens anteriores",
  "cClassTrib": [
   "200039",
   "000001",
   "200038"
  ],
  "indOp": [
   "100301"
  ],
  "nbs": [
   "111031000",
   "111033100",
   "111033200",
   "111033400",
   "111033500",
   "111033610",
   "111033620",
   "111033690",
   "111033900",
   "111034100",
   "111034200",
   "111034300",
   "111035000",
   "111039000",
   "111041000",
   "111043000",
   "111049000",
   "111051000",
   "111052000",
   "111053000",
   "111054100",
   "111054200",
   "111055100",
   "111055900",
   "111056000",
   "111057000",
   "111059000",
   "111061000",
   "111063100",
   "111063200",
   "111063400",
   "111063500",
   "111063610",
   "111063620",
   "111063690",
   "111063900",
   "111064100",
   "111064200",
   "111064300",
   "111065000",
   "111069000",
   "111071000",
   "111073100",
   "111073200",
   "111073900",
   "111074000",
   "111075000",
   "111079000",
   "111081000",
   "111083000",
   "111089000",
   "111091000",
   "111092000",
   "111093000",
   "111099000"
  ]
 },
 "99.03.01": {
  "descricao": "Locação de Bens Imóveis",
  "cClassTrib": [
   "200027",
   "200026",
   "221001",
   "200048"
  ],
  "indOp": [
   "020101",
   "030101",
   "020102"
  ],
  "nbs": [
   "110021000",
   "110022000"
  ]
 },
 "99.03.02": {
  "descricao": "Cessão Onerosa de Bens Imóveis",
  "cClassTrib": [
   "200027",
   "221001"
  ],
  "indOp": [
   "020101",
   "020102"
  ],
  "nbs": [
   "110021000",
   "110022000"
  ]
 },
 "99.03.03": {
  "descricao": "Arrendamento de Bens Imóveis",
  "cClassTrib": [
   "200027",
   "221001"
  ],
  "indOp": [
   "020101",
   "020102"
  ],
  "nbs": [
   "110021000",
   "110022000"
  ]
 },
 "99.03.04": {
  "descricao": "Servidão, Cessão de Uso ou de Espaço de Bens Imóveis (quando não caracterizem operações tributáveis pelo ISSQN)",
  "cClassTrib": [
   "200027"
  ],
  "indOp": [
   "020101",
   "020102"
  ],
  "nbs": [
   "110021000",
   "110022000"
  ]
 },
 "99.03.05": {
  "descricao": "Permissão de Uso ou Direito de Passagem de Bens Imóveis (quando não caracterizem operações tributáveis pelo ISSQN)",
  "cClassTrib": [
   "200027"
  ],
  "indOp": [
   "020101",
   "020102"
  ],
  "nbs": [
   "110021000",
   "110022000"
  ]
 },
 "99.04.01": {
  "descricao": "Locação de Bens Móveis",
  "cClassTrib": [
   "000001"
  ],
  "indOp": [
   "010101",
   "010102",
   "010103",
   "010106"
  ],
  "nbs": [
   "111011100",
   "111011200",
   "111011300",
   "111011400",
   "111011500",
   "111011600",
   "111011700",
   "111012000",
   "111013000",
   "111014000",
   "111015000",
   "111016000",
   "111019000",
   "111021000",
   "111022000",
   "111023000",
   "111024000",
   "111025000",
   "111026000",
   "111029000"
  ]
 },
 "99.05.01": {
  "descricao": "Operações condominiais",
  "cClassTrib": [
   "200046"
  ],
  "indOp": [
   "020201"
  ],
  "nbs": [
   "110019000"
  ]
 }
};

/** cClassTrib → nome oficial. */
export const NOMES_CCLASSTRIB: Record<string, string> = {
 "000001": "Situações tributadas integralmente pelo IBS e CBS.",
 "010002": "Operações do serviço financeiro",
 "011001": "Planos de assistência funerária.",
 "011003": "Intermediação de planos de assistência à saúde",
 "011005": "Planos de assistência à saúde de animais domésticos",
 "200016": "Prestação de serviços de pesquisa e desenvolvimento por Instituição Científica, Tecnológica e de Inovação (ICT)",
 "200021": "Serviços de transporte público coletivo de passageiros ferroviário e hidroviário",
 "200025": "Fornecimento dos serviços de educação relacionados ao Programa Universidade para Todos (Prouni)",
 "200026": "Locação de imóveis localizados nas zonas reabilitadas",
 "200027": "Operações de locação, cessão onerosa e arrendamento de bens imóveis",
 "200028": "Fornecimento dos serviços de educação (Anexo II)",
 "200029": "Fornecimento dos serviços de saúde humana (Anexo III)",
 "200037": "Fornecimento de serviços ambientais de conservação ou recuperação da vegetação nativa",
 "200038": "Fornecimento dos insumos agropecuários e aquícolas (Anexo IX)",
 "200039": "Fornecimento dos serviços e o licenciamento ou cessão dos direitos destinados às produções nacionais artísticas (Anexo X)",
 "200040": "Fornecimento de serviços de comunicação institucional à administração pública",
 "200041": "Fornecimento de serviço de educação desportiva (art. 141. I)",
 "200042": "Fornecimento de serviço de educação desportiva (art. 141. II)",
 "200043": "Fornecimento à administração pública dos serviços e dos bens relativos à soberania (Anexo XI)",
 "200044": "Operações e prestações de serviços de segurança da informação e segurança cibernética desenvolvidos por sociedade que tenha sócio brasileiro (Anexo XI)",
 "200045": "Operações relacionadas a projetos de reabilitação urbana de zonas históricas e de áreas críticas de recuperação e reconversão urbanística",
 "200046": "Operações com bens imóveis",
 "200048": "Hotelaria, Parques de Diversão e Parques Temáticos",
 "200051": "Agências de Turismo",
 "200052": "Prestação de serviços de profissões intelectuais",
 "221001": "Locação, cessão onerosa ou arrendamento de bem imóvel com alíquota sobre a receita bruta, observado o art. 487 da Lei Complementar nº 214, de 2025.",
 "400001": "Fornecimento de serviços de transporte público coletivo de passageiros rodoviário e metroviário",
 "820001": "Documento com informações de fornecimento de serviços de planos de assistência à saúde",
 "820002": "Documento com informações de fornecimento de serviços de planos de assistência funerária",
 "820003": "Documento com informações de fornecimento de serviços de planos de assistência à saúde de animais domésticos",
 "820006": "Documento com informações de fornecimento de serviços de exploração de via",
 "820007": "Documento com informações de fornecimento de serviços financeiros"
};

/** cIndOp → local de incidência do IBS. */
export const NOMES_CINDOP: Record<string, string> = {
 "010101": "local da entrega ou da disponibilização",
 "010102": "local da entrega ou da disponibilização",
 "010103": "local da entrega ou da disponibilização",
 "010106": "domicílio principal do adquirente (estabelecimento matriz)",
 "020101": "local do imóvel",
 "020102": "local do imóvel",
 "020201": "local do imóvel",
 "020202": "local do imóvel",
 "020301": "local do imóvel",
 "020401": "local do imóvel",
 "030101": "local da prestação no estabelecimento do fornecedor (prestador)",
 "030102": "local da prestação diverso do estabelecimento do fornecedor",
 "040101": "local do evento",
 "050101": "local da prestação no estabelecimento do fornecedor (prestador)",
 "050102": "local da prestação diverso do estabelecimento do fornecedor",
 "050201": "local da prestação (porto)",
 "060101": "local do início do transporte",
 "070101": "local da prestação",
 "080101": "via explorada",
 "100101": "Domicílio principal do adquirente",
 "100301": "Domicílio principal do adquirente",
 "100501": "Domicílio principal do adquirente",
 "130101": "Local do estabelecimento principal do fornecedor (gás natural)",
 "130201": "Local do estabelecimento principal do adquirente (gás natural)"
};

/** "040101" (cTribNac) → "04.01" */
export function itemLc116DoCodigo(codigoNacional: string | null | undefined): string | undefined {
  const d = (codigoNacional ?? "").replace(/\D/g, "");
  return d.length >= 4 ? `${d.slice(0, 2)}.${d.slice(2, 4)}` : undefined;
}

export function correlacaoIbsCbs(codigoNacional: string | null | undefined): CorrelacaoIbsCbs | undefined {
  const item = itemLc116DoCodigo(codigoNacional);
  return item ? IBSCBS_POR_ITEM[item] : undefined;
}
