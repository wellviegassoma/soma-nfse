// Tabela oficial do Simples Nacional (LC 123/2006, alterada pela
// LC 155/2016 — vigente desde 01/01/2018), Anexos III e V — os únicos
// relevantes aqui, já que o soma-nfse só emite NFS-e (prestação de
// serviço). Conferida contra a planilha real de apuração da SOMA
// (064-SN.xlsx) — os mesmos valores de alíquota, parcela a deduzir e
// partilha por faixa.
//
// Fonte: mesma tabela de qualquer PGDAS-D — não muda com frequência
// (última alteração foi a reforma de 2018). Se a lei mudar de novo,
// atualizar aqui.

export type Anexo = "III" | "V";

export type FaixaSimples = {
  faixa: number;
  de: number;
  ate: number;
  aliquota: number;
  deduzir: number;
  // Partilha do imposto dentro do DAS, nessa faixa.
  partilha: {
    irpj: number;
    csll: number;
    cofins: number;
    pis: number;
    cpp: number;
    iss: number;
  };
};

export const TABELA_ANEXO_III: FaixaSimples[] = [
  { faixa: 1, de: 0, ate: 180_000, aliquota: 0.06, deduzir: 0, partilha: { irpj: 0.04, csll: 0.035, cofins: 0.1282, pis: 0.0278, cpp: 0.434, iss: 0.335 } },
  { faixa: 2, de: 180_000.01, ate: 360_000, aliquota: 0.112, deduzir: 9_360, partilha: { irpj: 0.04, csll: 0.035, cofins: 0.1405, pis: 0.0305, cpp: 0.434, iss: 0.32 } },
  { faixa: 3, de: 360_000.01, ate: 720_000, aliquota: 0.135, deduzir: 17_640, partilha: { irpj: 0.04, csll: 0.035, cofins: 0.1364, pis: 0.0296, cpp: 0.434, iss: 0.325 } },
  { faixa: 4, de: 720_000.01, ate: 1_800_000, aliquota: 0.16, deduzir: 35_640, partilha: { irpj: 0.04, csll: 0.035, cofins: 0.1364, pis: 0.0296, cpp: 0.434, iss: 0.325 } },
  { faixa: 5, de: 1_800_000.01, ate: 3_600_000, aliquota: 0.21, deduzir: 125_640, partilha: { irpj: 0.04, csll: 0.035, cofins: 0.1282, pis: 0.0278, cpp: 0.434, iss: 0.335 } },
  { faixa: 6, de: 3_600_000.01, ate: 4_800_000, aliquota: 0.33, deduzir: 648_000, partilha: { irpj: 0.35, csll: 0.15, cofins: 0.1603, pis: 0.0347, cpp: 0.305, iss: 0 } },
];

export const TABELA_ANEXO_V: FaixaSimples[] = [
  { faixa: 1, de: 0, ate: 180_000, aliquota: 0.155, deduzir: 0, partilha: { irpj: 0.25, csll: 0.15, cofins: 0.141, pis: 0.0305, cpp: 0.2885, iss: 0.14 } },
  { faixa: 2, de: 180_000.01, ate: 360_000, aliquota: 0.18, deduzir: 4_500, partilha: { irpj: 0.23, csll: 0.15, cofins: 0.141, pis: 0.0305, cpp: 0.2785, iss: 0.17 } },
  { faixa: 3, de: 360_000.01, ate: 720_000, aliquota: 0.195, deduzir: 9_900, partilha: { irpj: 0.24, csll: 0.15, cofins: 0.1492, pis: 0.0323, cpp: 0.2385, iss: 0.19 } },
  { faixa: 4, de: 720_000.01, ate: 1_800_000, aliquota: 0.205, deduzir: 17_100, partilha: { irpj: 0.21, csll: 0.15, cofins: 0.1574, pis: 0.0341, cpp: 0.2385, iss: 0.21 } },
  { faixa: 5, de: 1_800_000.01, ate: 3_600_000, aliquota: 0.23, deduzir: 62_100, partilha: { irpj: 0.23, csll: 0.125, cofins: 0.141, pis: 0.0305, cpp: 0.2385, iss: 0.235 } },
  { faixa: 6, de: 3_600_000.01, ate: 4_800_000, aliquota: 0.305, deduzir: 540_000, partilha: { irpj: 0.35, csll: 0.155, cofins: 0.1644, pis: 0.0356, cpp: 0.295, iss: 0 } },
];

export const SUBLIMITE_SIMPLES = 4_800_000;

// Piso e teto legais da alíquota efetiva do ISS dentro do Simples
// (mesma trava aplicada na planilha manual: nunca sai de [2%, 5%]).
export const ISS_MINIMO = 0.02;
export const ISS_MAXIMO = 0.05;

export function tabelaPorAnexo(anexo: Anexo): FaixaSimples[] {
  return anexo === "III" ? TABELA_ANEXO_III : TABELA_ANEXO_V;
}

export function faixaPorRbt12(anexo: Anexo, rbt12: number): FaixaSimples {
  const tabela = tabelaPorAnexo(anexo);
  return tabela.find((f) => rbt12 >= f.de && rbt12 <= f.ate) ?? tabela[tabela.length - 1];
}
