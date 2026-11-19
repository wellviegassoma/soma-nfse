// Parâmetros da Reforma Tributária do Consumo (EC 132/2023, LC 214/2025,
// LC 227/2026) usados pelo simulador /admin/reforma-tributaria.
//
// FONTE DAS ALÍQUOTAS: base de dados oficial da Calculadora RTC da Receita
// Federal, publicada no GitHub com a Portaria Cotec nº 342/2026
// (github.com/ReceitaFederal/calculadora-rtc-regime-regular, pasta
// flyway/sql). Tabela ALIQUOTA_REFERENCIA:
//   - 2026: CBS 0,90% + IBS 0,10% (ano-teste, compensável — na prática
//     não aumenta a carga) — VIGENTE na base oficial.
//   - 2027-2033: o script de criação (B0001) trazia as projeções abaixo, mas
//     a migração V0053 (28/08/2026) APAGOU tudo depois de 31/12/2026 —
//     a alíquota de referência ainda depende de resolução do Senado. Por
//     isso esses anos aparecem na tela como ESTIMATIVA, não como dado
//     oficial. Quando a base oficial voltar a ter 2027+, atualizar aqui.
//
// FONTE DAS REDUÇÕES: tabela PERCENTUAL_REDUCAO × CLASSIFICACAO_TRIBUTARIA
// da mesma base (cClassTrib → % de redução de CBS e IBS).
//
// A Portaria diz que o código não tem efeito vinculante: tudo aqui é
// simulação para planejamento, a ser conferida pelo contador responsável.

export const ANOS_SIMULACAO = [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033] as const;
export type AnoSimulacao = (typeof ANOS_SIMULACAO)[number];

export type AliquotasAno = {
  cbs: number; // fração (0,084 = 8,4%)
  ibsUf: number;
  ibsMun: number;
  oficial: boolean; // true = vigente na base oficial; false = projeção
};

// Valores da tabela ALIQUOTA_REFERENCIA (em fração). 2026 é o único ano
// ainda vigente na base oficial depois da V0053.
export const ALIQUOTAS_REFERENCIA: Record<AnoSimulacao, AliquotasAno> = {
  2026: { cbs: 0.009, ibsUf: 0.001, ibsMun: 0, oficial: true },
  2027: { cbs: 0.084, ibsUf: 0.0005, ibsMun: 0.0005, oficial: false },
  2028: { cbs: 0.084, ibsUf: 0.0005, ibsMun: 0.0005, oficial: false },
  2029: { cbs: 0.085, ibsUf: 0.016, ibsMun: 0.0025, oficial: false },
  2030: { cbs: 0.085, ibsUf: 0.032, ibsMun: 0.005, oficial: false },
  2031: { cbs: 0.085, ibsUf: 0.048, ibsMun: 0.0075, oficial: false },
  2032: { cbs: 0.085, ibsUf: 0.064, ibsMun: 0.01, oficial: false },
  2033: { cbs: 0.085, ibsUf: 0.16, ibsMun: 0.025, oficial: false },
};

// Em 2026 CBS/IBS são destacados mas compensados com PIS/COFINS (LC 214
// art. 346-348) — não entram na conta de custo.
export function cbsIbsCobradoNoAno(ano: AnoSimulacao): boolean {
  return ano >= 2027;
}

// PIS/COFINS deixam de existir em 01/01/2027 (substituídos pela CBS).
export function pisCofinsExisteNoAno(ano: AnoSimulacao): boolean {
  return ano <= 2026;
}

// ISS/ICMS: integrais até 2028, depois reduzidos 10 p.p. por ano até a
// extinção em 2033 (EC 132, ADCT art. 128): 2029 = 90%, 2030 = 80%,
// 2031 = 70%, 2032 = 60%, 2033 = 0.
export const FATOR_ISS_ICMS: Record<AnoSimulacao, number> = {
  2026: 1,
  2027: 1,
  2028: 1,
  2029: 0.9,
  2030: 0.8,
  2031: 0.7,
  2032: 0.6,
  2033: 0,
};

// Redução de alíquota (CBS e IBS) por cClassTrib — só os códigos que
// aparecem para serviços na correlação do Anexo VIII da NFS-e (ver
// lib/ibscbs-correlacao.ts). Valores da tabela PERCENTUAL_REDUCAO oficial.
export const REDUCAO_POR_CCLASSTRIB: Record<string, number> = {
  "000001": 0, // tributação integral
  "010002": 0, // serviços financeiros (regime específico — simplificado aqui)
  "011001": 0.6, // planos de assistência funerária
  "011003": 0.6, // intermediação de planos de saúde
  "011005": 0.3, // planos de saúde de animais domésticos
  "200016": 1, // P&D por ICT
  "200021": 1, // transporte coletivo ferroviário/hidroviário
  "200025": 1, // educação — Prouni (60% ou 100%; usa 100%)
  "200026": 0.8, // locação em zonas reabilitadas
  "200027": 0.7, // locação/cessão/arrendamento de imóveis
  "200028": 0.6, // educação (Anexo II)
  "200029": 0.6, // saúde humana (Anexo III)
  "200037": 0.6,
  "200038": 0.6,
  "200039": 0.6, // produções artísticas nacionais (Anexo X)
  "200040": 0.6,
  "200041": 0.6, // educação desportiva
  "200042": 0.6,
  "200043": 0.6, // soberania (Anexo XI)
  "200044": 0.6, // segurança da informação (Anexo XI)
  "200045": 0.6,
  "200046": 0.5, // operações com bens imóveis
  "200048": 0.4, // hotelaria, parques
  "200051": 0.4, // agências de turismo
  "200052": 0.3, // profissões intelectuais (contador, advogado, engenheiro…)
};

export const OPCOES_REDUCAO = [
  { valor: 0, rotulo: "Sem redução (alíquota cheia)" },
  { valor: 0.3, rotulo: "30% — profissões intelectuais regulamentadas (200052)" },
  { valor: 0.4, rotulo: "40% — hotelaria / turismo (200048, 200051)" },
  { valor: 0.6, rotulo: "60% — saúde humana / educação (200029, 200028)" },
  { valor: 1, rotulo: "100% — alíquota zero" },
] as const;

// Encargos patronais sobre a folha fora do Simples (Anexos III e V já
// têm a CPP dentro do DAS): INSS 20% + RAT 2% (média — conferir FAP/CNAE)
// + Terceiros 5,8% sobre salários; 20% sobre pró-labore.
export const ENCARGO_PATRONAL_SALARIOS = 0.278;
export const ENCARGO_PATRONAL_PRO_LABORE = 0.2;

export const LIMITE_SIMPLES = 4_800_000;
export const SUBLIMITE_ISS_ICMS = 3_600_000;
export const LIMITE_LUCRO_PRESUMIDO = 78_000_000;

export const FONTES_OFICIAIS = [
  {
    rotulo: "Calculadora RTC — Regime Regular (CBS, IBS e IS)",
    url: "https://github.com/ReceitaFederal/calculadora-rtc-regime-regular",
  },
  {
    rotulo: "Calculadora RTC — Simples Nacional (CBS e IBS)",
    url: "https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional",
  },
  {
    rotulo: "Calculadora RTC — Gerador do DANFSe",
    url: "https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse",
  },
] as const;
