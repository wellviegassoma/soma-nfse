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

export const IRPJ_ALIQUOTA = 0.15;
const IRPJ_ADICIONAL_ALIQUOTA = 0.1;
const IRPJ_ADICIONAL_LIMITE_TRIMESTRE = 60_000;
export const CSLL_ALIQUOTA = 0.09;
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

export type ValoresDevidosMit = { irpj: number; csll: number; pis: number; cofins: number };

// Retenção sofrida pela empresa (a empresa é a PRESTADORA, retenção feita
// pelo tomador) — dado real vindo das notas (ver `buscarRetencoesMensal`/
// `somarRetencoes` em lib/faturamento.ts). `contribuicoesSociais` é a
// SOMA de PIS+COFINS+CSLL retidos (vRetCSLL do layout nacional, código de
// receita 5952/IN RFB 1234/2012) — o layout nacional não separa por
// tributo, só devolve o total combinado.
export type Retencao = { irrf: number; contribuicoesSociais: number };

const RETENCAO_SEM_VALOR: Retencao = { irrf: 0, contribuicoesSociais: 0 };

// Proporção padrão da retenção combinada de PIS+COFINS+CSLL (código 5952):
// 0,65% + 3% + 1% = 4,65% no total. Usada só pra SEPARAR o valor único
// retido em 3 parcelas (uma por tributo) — a Receita não manda isso já
// separado. Assume a alíquota combinada padrão da IN RFB 1234/2012;
// revisar se algum cliente tiver uma combinação de alíquotas diferente
// da usual (o valor total abatido não muda, só a proporção entre PIS/
// COFINS/CSLL individualmente).
const RETENCAO_COMBINADA_TOTAL = 0.0065 + 0.03 + 0.01;
const RETENCAO_PIS_PARTE = 0.0065 / RETENCAO_COMBINADA_TOTAL;
const RETENCAO_COFINS_PARTE = 0.03 / RETENCAO_COMBINADA_TOTAL;
const RETENCAO_CSLL_PARTE = 0.01 / RETENCAO_COMBINADA_TOTAL;

// `calcularLucroPresumido()` acima SEMPRE mostra a estimativa de IRPJ/CSLL
// do mês, mesmo em empresa de apuração trimestral — é proposital pra
// exibição (ver comentário na função). Mas isso não é o valor realmente
// devido no período pra fins de declarar no MIT: numa empresa trimestral,
// só existe débito de IRPJ/CSLL de verdade no 3º mês do trimestre (base =
// trimestre inteiro, não só o mês) — nos outros dois meses o débito é
// zero. PIS/COFINS continuam sempre mensais, em qualquer regime de
// apuração. Já vem líquido de retenção sofrida (IRRF abate IRPJ; a
// retenção combinada de PIS/COFINS/CSLL abate cada um proporcionalmente)
// — retencaoMes sempre usada pra PIS/COFINS (mensais em qualquer regime),
// retencaoTrimestre usada pra IRPJ/CSLL só no mês de fechamento (mesma
// janela usada pra calcular a base). Resultado pensado pra alimentar
// `montarDeclaracaoMit()` (`lib/mit-declaracao.ts`) E a exibição da UI —
// é a fonte única pras duas coisas, pra nunca mostrar um valor e declarar
// outro.
export function valoresDevidosNoPeriodoMit(
  resultado: ResultadoLucroPresumido,
  retencaoMes: Retencao = RETENCAO_SEM_VALOR,
  retencaoTrimestre: Retencao = RETENCAO_SEM_VALOR,
): ValoresDevidosMit {
  const pis = Math.max(0, resultado.pis - retencaoMes.contribuicoesSociais * RETENCAO_PIS_PARTE);
  const cofins = Math.max(0, resultado.cofins - retencaoMes.contribuicoesSociais * RETENCAO_COFINS_PARTE);

  const semDebitoDeFechamento = !resultado.apuracaoMensal && !resultado.ehUltimoMesDoTrimestre;
  if (semDebitoDeFechamento) {
    return { irpj: 0, csll: 0, pis, cofins };
  }

  // Mês de fechamento do trimestre (apuração mensal ou não): reconcilia
  // sobre a base do TRIMESTRE inteiro, não só a fatia do mês — mesmo
  // valor que sairia numa guia trimestral tradicional. A retenção
  // relevante pra abater também é a acumulada do trimestre inteiro, não
  // só a do mês de fechamento.
  if (resultado.ehUltimoMesDoTrimestre) {
    const irpjBruto = resultado.baseTrimestreIrpj * IRPJ_ALIQUOTA + resultado.irpjAdicional;
    const csllBruto = resultado.baseTrimestreIrpj * CSLL_ALIQUOTA; // presunção de CSLL == presunção de IRPJ pra serviços neste sistema
    return {
      irpj: Math.max(0, irpjBruto - retencaoTrimestre.irrf),
      csll: Math.max(0, csllBruto - retencaoTrimestre.contribuicoesSociais * RETENCAO_CSLL_PARTE),
      pis,
      cofins,
    };
  }

  // Apuração mensal, meses 1-2 do trimestre: usa a base do próprio mês
  // (resultado.irpj/csll já vêm calculados assim quando não é fechamento).
  return {
    irpj: Math.max(0, resultado.irpj - retencaoMes.irrf),
    csll: Math.max(0, resultado.csll - retencaoMes.contribuicoesSociais * RETENCAO_CSLL_PARTE),
    pis,
    cofins,
  };
}

export type ResultadoSimplesLiquido = {
  dasTotal: number;
  partilha: ResultadoSimplesNacional["partilha"];
  retencaoAplicada: number;
};

// Equivalente do valoresDevidosNoPeriodoMit, mas pro DAS do Simples
// Nacional — sempre mensal (não existe trimestre no Simples), então só
// precisa de uma janela de retenção. Abate IRRF do irpj da partilha e a
// retenção combinada de PIS/COFINS/CSLL de cada um proporcionalmente,
// reduzindo o dasTotal pelo mesmo montante abatido (o ISS e a CPP da
// partilha não são afetados — essa retenção é só sobre tributos
// federais).
export function abaterRetencaoDoDas(
  resultado: ResultadoSimplesNacional,
  retencaoMes: Retencao = RETENCAO_SEM_VALOR,
): ResultadoSimplesLiquido {
  const irpj = Math.max(0, resultado.partilha.irpj - retencaoMes.irrf);
  const csll = Math.max(0, resultado.partilha.csll - retencaoMes.contribuicoesSociais * RETENCAO_CSLL_PARTE);
  const pis = Math.max(0, resultado.partilha.pis - retencaoMes.contribuicoesSociais * RETENCAO_PIS_PARTE);
  const cofins = Math.max(0, resultado.partilha.cofins - retencaoMes.contribuicoesSociais * RETENCAO_COFINS_PARTE);

  const retencaoAplicada =
    resultado.partilha.irpj - irpj + (resultado.partilha.csll - csll) + (resultado.partilha.pis - pis) + (resultado.partilha.cofins - cofins);

  return {
    dasTotal: Math.max(0, resultado.dasTotal - retencaoAplicada),
    partilha: { ...resultado.partilha, irpj, csll, pis, cofins },
    retencaoAplicada,
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
