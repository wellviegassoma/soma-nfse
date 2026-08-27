// Classificação de atividade de prestação de serviço no Simples Nacional
// — decide se cai sempre no Anexo III, sempre no Anexo IV, ou se precisa
// do teste do Fator R (>=28% folha/receita = III, abaixo disso = V).
//
// Fonte: LC 123/2006, art. 18, §§5º-B a 5º-M (redação da LC 155/2016,
// vigente desde 01/01/2018 — texto conferido direto no Planalto em
// 27/08/2026: https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm).
// Cada entrada abaixo cita o parágrafo/inciso exato — se a lei mudar de
// novo, é só atualizar aqui; o resto do sistema (decidirAnexoFatorR em
// calculo-impostos.ts) só usa o `tratamento` resultante, nunca decide a
// classificação sozinho.
//
// IMPORTANTE: isso NÃO tenta adivinhar a atividade a partir do código
// LC 116 (municipal) ou do CNAE automaticamente — são classificações de
// leis diferentes, sem correspondência 1:1 garantida em lei. A escolha
// de qual item daqui se aplica a um serviço é (e continua sendo) um
// julgamento profissional do contador no cadastro; o que este módulo
// garante é que, uma vez escolhido o item certo, o tratamento tributário
// aplicado está certo e rastreável até o texto da lei.

export type TratamentoAtividade = "ANEXO_III_FIXO" | "FATOR_R" | "ANEXO_IV_FIXO";

export type AtividadeSimplesNacional = {
  id: string; // chave estável — usar isso no cadastro, não o índice/posição
  descricao: string;
  citacao: string;
  tratamento: TratamentoAtividade;
};

export const ATIVIDADES_SIMPLES_NACIONAL: AtividadeSimplesNacional[] = [
  // --- Sempre Anexo III (nunca passa pelo teste do Fator R) — §5º-B ---
  {
    id: "ensino",
    descricao:
      "Creche, pré-escola, ensino fundamental, escolas técnicas/profissionais/médio, línguas estrangeiras, artes, cursos técnicos de pilotagem, preparatórios para concursos, gerenciais e escolas livres",
    citacao: "LC 123/2006, art. 18, §5º-B, I",
    tratamento: "ANEXO_III_FIXO",
  },
  { id: "correios_terceirizado", descricao: "Agência terceirizada de correios", citacao: "§5º-B, II", tratamento: "ANEXO_III_FIXO" },
  { id: "agencia_viagem", descricao: "Agência de viagem e turismo", citacao: "§5º-B, III", tratamento: "ANEXO_III_FIXO" },
  {
    id: "formacao_condutores",
    descricao: "Centro de formação de condutores de veículos automotores (autoescola)",
    citacao: "§5º-B, IV",
    tratamento: "ANEXO_III_FIXO",
  },
  { id: "agencia_loterica", descricao: "Agência lotérica", citacao: "§5º-B, V", tratamento: "ANEXO_III_FIXO" },
  {
    id: "instalacao_reparo_manutencao",
    descricao: "Instalação, reparos e manutenção em geral, usinagem, solda, tratamento e revestimento em metais",
    citacao: "§5º-B, IX",
    tratamento: "ANEXO_III_FIXO",
  },
  {
    id: "transporte_municipal_passageiros",
    descricao: "Transporte municipal de passageiros",
    citacao: "§5º-B, XIII",
    tratamento: "ANEXO_III_FIXO",
  },
  {
    id: "escritorio_contabilidade",
    descricao: "Escritórios de serviços contábeis (regras próprias adicionais nos §§22-B/22-C)",
    citacao: "§5º-B, XIV",
    tratamento: "ANEXO_III_FIXO",
  },
  {
    id: "producao_cultural",
    descricao: "Produções cinematográficas, audiovisuais, artísticas e culturais (música, literatura, artes cênicas/visuais)",
    citacao: "§5º-B, XV",
    tratamento: "ANEXO_III_FIXO",
  },
  { id: "corretagem_seguros", descricao: "Corretagem de seguros", citacao: "§5º-B, XVII", tratamento: "ANEXO_III_FIXO" },

  // --- Sujeitas ao Fator R (§5º-B incisos listados no §5º-M, I) ---
  { id: "fisioterapia", descricao: "Fisioterapia", citacao: "§5º-B, XVI c/c §5º-M, I", tratamento: "FATOR_R" },
  { id: "arquitetura_urbanismo", descricao: "Arquitetura e urbanismo", citacao: "§5º-B, XVIII c/c §5º-M, I", tratamento: "FATOR_R" },
  {
    id: "medicina",
    descricao: "Medicina, inclusive laboratorial, e enfermagem",
    citacao: "§5º-B, XIX c/c §5º-M, I",
    tratamento: "FATOR_R",
  },
  { id: "odontologia", descricao: "Odontologia e prótese dentária", citacao: "§5º-B, XX c/c §5º-M, I", tratamento: "FATOR_R" },
  {
    id: "psicologia_terapias",
    descricao: "Psicologia, psicanálise, terapia ocupacional, acupuntura, podologia, fonoaudiologia, clínicas de nutrição e de vacinação, bancos de leite",
    citacao: "§5º-B, XXI c/c §5º-M, I",
    tratamento: "FATOR_R",
  },

  // --- Sujeitas ao Fator R — §5º-D (c/c §5º-M, II) ---
  {
    id: "administracao_locacao_imoveis",
    descricao: "Administração e locação de imóveis de terceiros",
    citacao: "§5º-D, I c/c §5º-M, II",
    tratamento: "FATOR_R",
  },
  {
    id: "academias_dança_artes_marciais",
    descricao: "Academias de dança, de capoeira, de ioga e de artes marciais",
    citacao: "§5º-D, II c/c §5º-M, II",
    tratamento: "FATOR_R",
  },
  {
    id: "academias_atividade_fisica",
    descricao: "Academias de atividades físicas, desportivas, de natação e escolas de esportes",
    citacao: "§5º-D, III c/c §5º-M, II",
    tratamento: "FATOR_R",
  },
  {
    id: "software_desenvolvimento",
    descricao: "Elaboração de programas de computador, inclusive jogos eletrônicos (desenvolvidos no estabelecimento do optante)",
    citacao: "§5º-D, IV c/c §5º-M, II",
    tratamento: "FATOR_R",
  },
  {
    id: "software_licenciamento",
    descricao: "Licenciamento ou cessão de direito de uso de programas de computação",
    citacao: "§5º-D, V c/c §5º-M, II",
    tratamento: "FATOR_R",
  },
  {
    id: "paginas_eletronicas",
    descricao: "Planejamento, confecção, manutenção e atualização de páginas eletrônicas (no estabelecimento do optante)",
    citacao: "§5º-D, VI c/c §5º-M, II",
    tratamento: "FATOR_R",
  },
  {
    id: "montagem_estandes",
    descricao: "Empresas montadoras de estandes para feiras",
    citacao: "§5º-D, IX c/c §5º-M, II",
    tratamento: "FATOR_R",
  },
  {
    id: "laboratorio_analises_clinicas",
    descricao: "Laboratórios de análises clínicas ou de patologia clínica",
    citacao: "§5º-D, XII c/c §5º-M, II",
    tratamento: "FATOR_R",
  },
  {
    id: "diagnostico_por_imagem",
    descricao: "Serviços de tomografia, diagnósticos médicos por imagem, registros gráficos, métodos óticos e ressonância magnética",
    citacao: "§5º-D, XIII c/c §5º-M, II",
    tratamento: "FATOR_R",
  },
  { id: "proteses_gerais", descricao: "Serviços de prótese em geral", citacao: "§5º-D, XIV c/c §5º-M, II", tratamento: "FATOR_R" },

  // --- Sujeitas ao Fator R — §5º-I (base Anexo V, sobe pra III com §5º-J) ---
  { id: "medicina_veterinaria", descricao: "Medicina veterinária", citacao: "§5º-I, II c/c §5º-J", tratamento: "FATOR_R" },
  {
    id: "despachante_traducao",
    descricao: "Serviços de comissaria, de despachantes, de tradução e de interpretação",
    citacao: "§5º-I, V c/c §5º-J",
    tratamento: "FATOR_R",
  },
  {
    id: "engenharia_tecnica",
    descricao: "Engenharia, medição, cartografia, topografia, geologia, geodésia, testes, suporte e análises técnicas e tecnológicas, pesquisa, design, desenho e agronomia",
    citacao: "§5º-I, VI c/c §5º-J",
    tratamento: "FATOR_R",
  },
  {
    id: "representacao_comercial",
    descricao: "Representação comercial e demais atividades de intermediação de negócios e serviços de terceiros",
    citacao: "§5º-I, VII c/c §5º-J",
    tratamento: "FATOR_R",
  },
  { id: "pericia_leilao", descricao: "Perícia, leilão e avaliação", citacao: "§5º-I, VIII c/c §5º-J", tratamento: "FATOR_R" },
  {
    id: "auditoria_consultoria",
    descricao: "Auditoria, economia, consultoria, gestão, organização, controle e administração",
    citacao: "§5º-I, IX c/c §5º-J",
    tratamento: "FATOR_R",
  },
  { id: "jornalismo_publicidade", descricao: "Jornalismo e publicidade", citacao: "§5º-I, X c/c §5º-J", tratamento: "FATOR_R" },
  {
    id: "agenciamento",
    descricao: "Agenciamento, exceto de mão de obra",
    citacao: "§5º-I, XI c/c §5º-J",
    tratamento: "FATOR_R",
  },
  {
    id: "outras_intelectuais",
    descricao:
      'Catch-all: "outras atividades do setor de serviços que tenham por finalidade a prestação de serviços decorrentes do exercício de atividade intelectual, de natureza técnica, científica, desportiva, artística ou cultural", regulamentada ou não, desde que não enquadrada nos Anexos III ou IV — use só quando nenhum item específico da lista servir',
    citacao: "§5º-I, XII c/c §5º-J",
    tratamento: "FATOR_R",
  },

  // --- Anexo IV fixo (CPP recolhida à parte, fora do Simples) — §5º-C ---
  // Nota: a tabela de faixas/alíquotas do Anexo IV ainda não está
  // modelada em simples-nacional-tabela.ts (só III e V) — calculo-impostos.ts
  // precisará da TABELA_ANEXO_IV antes de qualquer cliente destas
  // atividades usar o cálculo automático.
  {
    id: "construcao_civil",
    descricao: "Construção de imóveis e obras de engenharia em geral, subempreitada, execução de projetos, paisagismo e decoração de interiores",
    citacao: "§5º-C, I",
    tratamento: "ANEXO_IV_FIXO",
  },
  {
    id: "vigilancia_limpeza",
    descricao: "Serviço de vigilância, limpeza ou conservação",
    citacao: "§5º-C, VI",
    tratamento: "ANEXO_IV_FIXO",
  },
  { id: "advocacia", descricao: "Serviços advocatícios", citacao: "§5º-C, VII", tratamento: "ANEXO_IV_FIXO" },
];

export function buscarAtividade(id: string): AtividadeSimplesNacional | undefined {
  return ATIVIDADES_SIMPLES_NACIONAL.find((a) => a.id === id);
}

// Tudo que NÃO tiver um `id` correspondente aqui e não for claramente
// enquadrável em nenhum item acima cai, por padrão legal residual, no
// §5º-F (Anexo III) — mas isso deve ser uma decisão explícita do
// contador no cadastro, não um fallback silencioso do código.
export const CITACAO_RESIDUAL_ANEXO_III = "LC 123/2006, art. 18, §5º-F (catch-all — Anexo III salvo previsão expressa em IV ou V)";
