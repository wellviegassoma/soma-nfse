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

// Não sujeito ao Fator R (ou sem % informado) cai direto no Anexo III —
// é o caso normal da maioria dos prestadores de serviço. Sujeito ao
// Fator R: >= 28% usa Anexo III (mais vantajoso quando a folha é alta),
// abaixo disso usa Anexo V.
export function decidirAnexoFatorR(sujeitoFatorR: boolean, fatorRPercentual: number | null): Anexo {
  return !sujeitoFatorR || (fatorRPercentual ?? 1) >= 0.28 ? "III" : "V";
}

export function calcularSimplesNacional(params: {
  receitaMes: number;
  rbt12: number;
  rbt12Estimado: boolean;
  sujeitoFatorR: boolean;
  fatorRPercentual: number | null;
}): ResultadoSimplesNacional {
  const { receitaMes, rbt12, rbt12Estimado, sujeitoFatorR, fatorRPercentual } = params;

  const anexo: Anexo = decidirAnexoFatorR(sujeitoFatorR, fatorRPercentual);

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
  irpjBase: number;
  irpjAdicional: number;
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

  // IRPJ/CSLL sempre mostram a estimativa do MÊS (base do próprio mês),
  // não zerado nos dois primeiros meses do trimestre esperando o
  // fechamento — mesmo quando o recolhimento real só sai trimestral, é
  // mais útil ver o valor acumulando mês a mês do que ver R$0,00 até o
  // 3º mês. O adicional de 10% continua sendo assentado só no fechamento
  // do trimestre (mesma regra da planilha manual), sobre a base
  // acumulada do trimestre até ali — não dá pra saber se ele se aplica
  // usando só o mês isolado.
  const adicionalIrpj = ehUltimoMesDoTrimestre
    ? Math.max(0, baseIrpjTrimestre - IRPJ_ADICIONAL_LIMITE_TRIMESTRE) * IRPJ_ADICIONAL_ALIQUOTA
    : 0;

  const irpjBase = baseIrpjMes * IRPJ_ALIQUOTA;
  const irpj = irpjBase + adicionalIrpj;
  const csll = baseCsllMes * CSLL_ALIQUOTA;

  const pis = receitaMes * PIS_ALIQUOTA;
  const cofins = receitaMes * COFINS_ALIQUOTA;
  const iss = aliquotaIss != null ? receitaMes * aliquotaIss : null;

  return {
    irpjBase,
    irpjAdicional: adicionalIrpj,
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

export type ResumoImposto = { aliquotaEfetiva: number; valor: number };

// Versão resumida (só alíquota efetiva + valor do mês), independente do
// regime — usada em listas com várias empresas (ex.: Visão geral), onde
// não cabe o detalhamento por componente. `null` quando o regime não tem
// cálculo suportado (sem regime definido, ou Lucro Real).
export function calcularImpostoResumo(params: {
  taxRegime: string | null;
  receitaMes: number;
  rbt12: number;
  sujeitoFatorR: boolean;
  fatorRPercentual: number | null;
  receitaTrimestre: number;
  ehUltimoMesDoTrimestre: boolean;
  apuracaoMensal: boolean;
  aliquotaIss: number | null;
}): ResumoImposto | null {
  if (params.taxRegime === "SIMPLES_NACIONAL") {
    const r = calcularSimplesNacional({
      receitaMes: params.receitaMes,
      rbt12: params.rbt12,
      rbt12Estimado: false, // não afeta o cálculo em si, só é exibido separadamente
      sujeitoFatorR: params.sujeitoFatorR,
      fatorRPercentual: params.fatorRPercentual,
    });
    return { aliquotaEfetiva: r.aliquotaEfetiva, valor: r.dasTotal };
  }

  if (params.taxRegime === "LUCRO_PRESUMIDO") {
    const r = calcularLucroPresumido({
      receitaMes: params.receitaMes,
      receitaTrimestre: params.receitaTrimestre,
      ehUltimoMesDoTrimestre: params.ehUltimoMesDoTrimestre,
      apuracaoMensal: params.apuracaoMensal,
      aliquotaIss: params.aliquotaIss,
    });
    return {
      aliquotaEfetiva: params.receitaMes > 0 ? r.total / params.receitaMes : 0,
      valor: r.total,
    };
  }

  return null;
}
