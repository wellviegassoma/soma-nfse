// Cálculo de imposto estimado com base no faturamento já registrado no
// sistema — não substitui a apuração oficial (PGDAS-D / ECF), é uma
// referência rápida pro contador. Fórmulas conferidas contra as planilhas
// manuais reais da SOMA (Simples Nacional e Lucro Presumido).
import {
  faixaPorRbt12,
  ISS_MAXIMO,
  ISS_MINIMO,
  type Anexo,
} from "@/lib/simples-nacional-tabela";

export type ResultadoSimplesNacional = {
  anexo: Anexo;
  faixa: number;
  rbt12: number;
  rbt12Estimado: boolean; // menos de 12 meses de histórico — RBT12 projetado
  aliquotaNominal: number;
  aliquotaEfetiva: number;
  receitaMes: number;
  dasTotal: number;
  partilha: {
    irpj: number;
    csll: number;
    cofins: number;
    pis: number;
    cpp: number;
    iss: number;
  };
};

export function calcularSimplesNacional(params: {
  receitaMes: number;
  rbt12: number;
  rbt12Estimado: boolean;
  sujeitoFatorR: boolean;
  fatorRPercentual: number | null;
}): ResultadoSimplesNacional {
  const { receitaMes, rbt12, rbt12Estimado, sujeitoFatorR, fatorRPercentual } = params;

  // Não sujeito ao Fator R (ou sem % informado) cai direto no Anexo III —
  // é o caso normal da maioria dos prestadores de serviço. Sujeito ao
  // Fator R: >= 28% usa Anexo III (mais vantajoso quando a folha é alta),
  // abaixo disso usa Anexo V.
  const anexo: Anexo = !sujeitoFatorR || (fatorRPercentual ?? 1) >= 0.28 ? "III" : "V";

  const faixaInfo = faixaPorRbt12(anexo, rbt12);
  const aliquotaEfetiva =
    rbt12 > 0 ? (rbt12 * faixaInfo.aliquota - faixaInfo.deduzir) / rbt12 : 0;
  const dasTotal = receitaMes * aliquotaEfetiva;

  const percentualIss =
    faixaInfo.partilha.iss === 0
      ? 0 // faixas acima de R$3,6mi: ISS sai do Simples, recolhido à parte do município — fora do escopo aqui
      : Math.min(Math.max(aliquotaEfetiva * faixaInfo.partilha.iss, ISS_MINIMO), ISS_MAXIMO);

  return {
    anexo,
    faixa: faixaInfo.faixa,
    rbt12,
    rbt12Estimado,
    aliquotaNominal: faixaInfo.aliquota,
    aliquotaEfetiva,
    receitaMes,
    dasTotal,
    partilha: {
      irpj: dasTotal * faixaInfo.partilha.irpj,
      csll: dasTotal * faixaInfo.partilha.csll,
      cofins: dasTotal * faixaInfo.partilha.cofins,
      pis: dasTotal * faixaInfo.partilha.pis,
      cpp: dasTotal * faixaInfo.partilha.cpp,
      iss: receitaMes * percentualIss,
    },
  };
}

const IRPJ_ALIQUOTA = 0.15;
const IRPJ_ADICIONAL_ALIQUOTA = 0.1;
const IRPJ_ADICIONAL_LIMITE_TRIMESTRE = 60_000;
const CSLL_ALIQUOTA = 0.09;
const PRESUNCAO_SERVICOS_IRPJ = 0.32;
const PRESUNCAO_SERVICOS_CSLL = 0.32;
const PIS_ALIQUOTA = 0.0065; // regime cumulativo
const COFINS_ALIQUOTA = 0.03; // regime cumulativo

export type ResultadoLucroPresumido = {
  irpj: number;
  csll: number;
  pis: number;
  cofins: number;
  iss: number | null;
  total: number;
  apuracaoMensal: boolean;
  ehUltimoMesDoTrimestre: boolean;
  adicionalIrpjAplicado: boolean;
  baseTrimestreIrpj: number;
};

export function calcularLucroPresumido(params: {
  receitaMes: number;
  receitaTrimestre: number;
  ehUltimoMesDoTrimestre: boolean;
  apuracaoMensal: boolean;
  aliquotaIss: number | null;
}): ResultadoLucroPresumido {
  const { receitaMes, receitaTrimestre, ehUltimoMesDoTrimestre, apuracaoMensal, aliquotaIss } =
    params;

  const baseIrpjMes = receitaMes * PRESUNCAO_SERVICOS_IRPJ;
  const baseIrpjTrimestre = receitaTrimestre * PRESUNCAO_SERVICOS_IRPJ;
  const baseCsllMes = receitaMes * PRESUNCAO_SERVICOS_CSLL;
  const baseCsllTrimestre = receitaTrimestre * PRESUNCAO_SERVICOS_CSLL;

  // O adicional de 10% só é verificado no fechamento do trimestre (ou a
  // cada mês, se antecipação mensal, mas sempre sobre a base acumulada do
  // trimestre até ali) — mesma regra da planilha manual: só entra na
  // conta no 3º mês.
  const adicionalIrpj = ehUltimoMesDoTrimestre
    ? Math.max(0, baseIrpjTrimestre - IRPJ_ADICIONAL_LIMITE_TRIMESTRE) * IRPJ_ADICIONAL_ALIQUOTA
    : 0;

  const irpj = apuracaoMensal
    ? baseIrpjMes * IRPJ_ALIQUOTA + adicionalIrpj
    : ehUltimoMesDoTrimestre
      ? baseIrpjTrimestre * IRPJ_ALIQUOTA + adicionalIrpj
      : 0;

  const csll = apuracaoMensal
    ? baseCsllMes * CSLL_ALIQUOTA
    : ehUltimoMesDoTrimestre
      ? baseCsllTrimestre * CSLL_ALIQUOTA
      : 0;

  const pis = receitaMes * PIS_ALIQUOTA;
  const cofins = receitaMes * COFINS_ALIQUOTA;
  const iss = aliquotaIss != null ? receitaMes * aliquotaIss : null;

  return {
    irpj,
    csll,
    pis,
    cofins,
    iss,
    total: irpj + csll + pis + cofins + (iss ?? 0),
    apuracaoMensal,
    ehUltimoMesDoTrimestre,
    adicionalIrpjAplicado: adicionalIrpj > 0,
    baseTrimestreIrpj: baseIrpjTrimestre,
  };
}
