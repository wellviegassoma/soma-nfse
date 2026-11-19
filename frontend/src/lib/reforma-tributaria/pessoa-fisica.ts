// Simulador PESSOA FÍSICA × ABRIR PJ, para o profissional que hoje fatura
// no CPF (livro caixa / carnê-leão).
//
// As calculadoras oficiais da Receita (Portaria Cotec 342/2026) NÃO têm esse
// cálculo — só a CBS/IBS por operação. O IRPF, o INSS e a retirada da PJ
// (pró-labore + dividendos) são modelados aqui.
//
// Regras da Reforma para a pessoa física (LC 214/2025):
//  - art. 21, I, "c": é contribuinte de IBS/CBS quem fornece "de forma
//    profissional, ainda que a profissão não seja regulamentada" — inclui o
//    profissional autônomo no CPF;
//  - art. 26, IV: NÃO é contribuinte o nanoempreendedor — pessoa física com
//    receita bruta abaixo de 50% do limite do MEI (R$ 40.500/ano);
//  - arts. 127 e 130: as reduções de 30% (profissões intelectuais, serviço
//    ligado à habilitação) e de 60% (saúde) valem também para a pessoa física.
//
// Comparação pelo LÍQUIDO NO BOLSO do profissional no ano:
//   receita − despesas − tributos − custo de manter a PJ (quando PJ).
// Simplificações (mostradas na tela): receita e despesas iguais todo mês;
// carnê-leão mês a mês, sem o ajuste anual da declaração; um sócio só; IRPF
// mínimo de alta renda (Lei 15.270/2025) só avisado, não calculado.

import {
  NOME_REGIME,
  cbsIbsRegular,
  simularLucroPresumido,
  simularSimples,
  simularSimplesHibrido,
  type Cenario,
  type Componente,
  type EntradaSimulacao,
  type RegimeSimulado,
} from "@/lib/reforma-tributaria/motor";
import { FATOR_ISS_ICMS, cbsIbsCobradoNoAno, type AnoSimulacao } from "@/lib/reforma-tributaria/parametros";

// ---------------------------------------------------------------------------
// Parâmetros da pessoa física — CONFERIR a cada ano (mostrados na tela).
// ---------------------------------------------------------------------------

// Tabela progressiva mensal do IRPF vigente desde 05/2025 (Lei 15.191/2025).
export const TABELA_IRPF_MENSAL = [
  { ate: 2_428.8, aliquota: 0, deduzir: 0 },
  { ate: 2_826.65, aliquota: 0.075, deduzir: 182.16 },
  { ate: 3_751.05, aliquota: 0.15, deduzir: 394.16 },
  { ate: 4_664.68, aliquota: 0.225, deduzir: 675.49 },
  { ate: Infinity, aliquota: 0.275, deduzir: 908.73 },
] as const;

// Redução do IRPF mensal a partir de 2026 (Lei 15.270/2025): zera o imposto
// de quem ganha até R$ 5.000/mês e reduz em faixa decrescente até R$ 7.350.
export const REDUTOR_IRPF = {
  isencaoAte: 5_000,
  reducaoMaxima: 312.89,
  faixaAte: 7_350,
  constante: 978.62,
  fator: 0.133145,
} as const;

export const DEDUCAO_DEPENDENTE_MENSAL = 189.59;
// Desconto simplificado mensal (substitui as deduções legais quando for maior).
// É com ele que o redutor da Lei 15.270 zera o imposto de quem ganha R$ 5 mil.
export const DESCONTO_SIMPLIFICADO_MENSAL = 607.2;
export const TETO_INSS_MENSAL = 8_157.41; // 2026
export const INSS_CONTRIBUINTE_INDIVIDUAL = 0.2; // autônomo (carnê / GPS)
export const INSS_SEGURADO_PRO_LABORE = 0.11; // retido do sócio no pró-labore
export const SALARIO_MINIMO = 1_518; // pró-labore mínimo usado na simulação — conferir o de 2026
export const LIMITE_NANOEMPREENDEDOR = 40_500; // 50% do limite do MEI (R$ 81 mil)
// Dividendos (Lei 15.270/2025): retenção de 10% quando a mesma PJ paga mais
// de R$ 50 mil no mês à mesma pessoa física.
export const DIVIDENDOS_LIMITE_MENSAL = 50_000;
export const DIVIDENDOS_ALIQUOTA = 0.1;
export const LIMITE_IRPF_MINIMO_ALTA_RENDA = 600_000; // por ano

function irpfTabela(base: number): number {
  const b = Math.max(0, base);
  const faixa = TABELA_IRPF_MENSAL.find((f) => b <= f.ate)!;
  return Math.max(0, b * faixa.aliquota - faixa.deduzir);
}

/**
 * IRPF do mês: tabela progressiva sobre (rendimento − deduções), usando o
 * maior entre as deduções legais e o desconto simplificado, menos o redutor
 * da Lei 15.270, calculado sobre o RENDIMENTO tributável do mês.
 */
export function irpfMensal(rendimentoTributavel: number, deducoesLegais: number): number {
  const deducoes = Math.max(deducoesLegais, DESCONTO_SIMPLIFICADO_MENSAL);
  const imposto = irpfTabela(rendimentoTributavel - deducoes);
  const r = rendimentoTributavel;
  let reducao = 0;
  if (r <= REDUTOR_IRPF.isencaoAte) reducao = REDUTOR_IRPF.reducaoMaxima;
  else if (r <= REDUTOR_IRPF.faixaAte) reducao = REDUTOR_IRPF.constante - REDUTOR_IRPF.fator * r;
  return Math.max(0, imposto - Math.max(0, reducao));
}

// ---------------------------------------------------------------------------
// Entrada e resultado
// ---------------------------------------------------------------------------

export type EntradaPessoaFisica = {
  receitaAnual: number;
  // Despesas dedutíveis do livro caixa (aluguel do consultório, secretária, material…).
  despesasAnual: number;
  dependentes: number;
  // ISS do autônomo (valor fixo anual cobrado pelo município).
  issAutonomoAnual: number;
  reducaoCbsIbs: number; // fração — mesma tabela do cClassTrib (saúde 60%, intelectual 30%)
  custosCreditaveisPct: number; // compras com crédito de CBS/IBS (fração da receita)
  percentualB2b: number; // receita vinda de PJ que aproveita crédito
  // Para a simulação da PJ:
  sujeitoFatorR: boolean; // atividade sujeita ao Fator R no Simples (medicina etc.)
  aliquotaIssPj: number; // ISS da PJ fora do Simples (fração)
  custoManterPjAnual: number; // honorários contábeis, taxas, certificado…
};

export type OpcaoId = "PF" | RegimeSimulado;

export const NOME_OPCAO: Record<OpcaoId, string> = {
  PF: "Continuar na pessoa física",
  SIMPLES: `PJ — ${NOME_REGIME.SIMPLES}`,
  SIMPLES_HIBRIDO: `PJ — ${NOME_REGIME.SIMPLES_HIBRIDO}`,
  LUCRO_PRESUMIDO: `PJ — ${NOME_REGIME.LUCRO_PRESUMIDO}`,
};

export type OpcaoPessoaFisica = {
  id: OpcaoId;
  elegivel: boolean;
  motivoInelegivel?: string;
  componentes: Componente[];
  tributos: number; // tudo que vai para o governo no ano
  custoPj: number;
  liquido: number; // o que fica no bolso: receita − despesas − tributos − custo PJ
  cargaPct: number; // tributos ÷ receita
  creditoGeradoCliente: number;
  // Líquido somando o valor do crédito que o cliente PJ aproveita (× % B2B).
  liquidoEfetivo: number;
  proLaboreMensal?: number;
  avisos: string[];
};

function somar(cs: Componente[]) {
  return cs.reduce((a, c) => a + c.valor, 0);
}

function fecharOpcao(
  id: OpcaoId,
  e: EntradaPessoaFisica,
  componentes: Componente[],
  custoPj: number,
  creditoGeradoCliente: number,
  avisos: string[],
  extra: Partial<OpcaoPessoaFisica> = {},
): OpcaoPessoaFisica {
  const visiveis = componentes.filter((c) => Math.abs(c.valor) >= 0.005);
  const tributos = somar(visiveis);
  const liquido = e.receitaAnual - e.despesasAnual - tributos - custoPj;
  return {
    id,
    elegivel: true,
    componentes: visiveis,
    tributos,
    custoPj,
    liquido,
    cargaPct: e.receitaAnual > 0 ? tributos / e.receitaAnual : 0,
    creditoGeradoCliente,
    liquidoEfetivo: liquido + creditoGeradoCliente * e.percentualB2b,
    avisos,
    ...extra,
  };
}

// Entrada "como PJ" para reaproveitar o motor da carteira (CBS/IBS regular).
function comoEntradaPj(e: EntradaPessoaFisica, proLaboreAnual: number): EntradaSimulacao {
  return {
    receitaAnual: e.receitaAnual,
    receitaHospitalarAnual: 0,
    salariosAnual: 0,
    proLaboreAnual,
    fgtsAnual: 0,
    sujeitoFatorR: e.sujeitoFatorR,
    aliquotaIss: e.aliquotaIssPj,
    issFixoAnual: null,
    reducaoCbsIbs: e.reducaoCbsIbs,
    custosCreditaveisPct: e.custosCreditaveisPct,
    percentualB2b: e.percentualB2b,
  };
}

// ---------------------------------------------------------------------------
// Continuar na pessoa física
// ---------------------------------------------------------------------------

export function simularContinuarPF(e: EntradaPessoaFisica, ano: AnoSimulacao): OpcaoPessoaFisica {
  const receitaMes = e.receitaAnual / 12;
  const despesasMes = Math.min(e.despesasAnual, e.receitaAnual) / 12;
  const inssMes = INSS_CONTRIBUINTE_INDIVIDUAL * Math.min(receitaMes, TETO_INSS_MENSAL);
  const deducoesMes = despesasMes + inssMes + e.dependentes * DEDUCAO_DEPENDENTE_MENSAL;
  const baseMes = receitaMes - Math.max(deducoesMes, DESCONTO_SIMPLIFICADO_MENSAL);
  const irpfMes = irpfMensal(receitaMes, deducoesMes);
  const iss = e.issAutonomoAnual * FATOR_ISS_ICMS[ano];

  const nano = e.receitaAnual < LIMITE_NANOEMPREENDEDOR;
  const reg = !nano && cbsIbsCobradoNoAno(ano) ? cbsIbsRegular(comoEntradaPj(e, 0), ano) : null;

  const componentes: Componente[] = [
    { rotulo: "IRPF — carnê-leão", valor: irpfMes * 12 },
    { rotulo: "INSS autônomo (20%, até o teto)", valor: inssMes * 12 },
    { rotulo: "ISS do autônomo", valor: iss, destaque: FATOR_ISS_ICMS[ano] < 1 ? "saindo" : undefined },
    { rotulo: "CBS (débito − crédito)", valor: reg?.cbs ?? 0, destaque: "novo" },
    { rotulo: "IBS (débito − crédito)", valor: reg?.ibs ?? 0, destaque: "novo" },
  ];
  const avisos: string[] = [];
  if (nano) avisos.push("Receita abaixo de R$ 40,5 mil/ano: nanoempreendedor, não paga CBS/IBS (LC 214, art. 26, IV)");
  else if (cbsIbsCobradoNoAno(ano)) avisos.push("Acima de R$ 40,5 mil/ano: contribuinte de CBS/IBS como pessoa física (LC 214, art. 21) — precisa de CNPJ só para isso");
  if (baseMes > 0 && irpfMes > 0) {
    const faixa = TABELA_IRPF_MENSAL.find((f) => baseMes <= f.ate)!;
    avisos.push(`IRPF na faixa de ${(faixa.aliquota * 100).toFixed(1)}% (base mensal ${baseMes.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})`);
  }
  if (e.receitaAnual > LIMITE_IRPF_MINIMO_ALTA_RENDA) avisos.push("Renda acima de R$ 600 mil/ano: conferir o IRPF mínimo de alta renda (Lei 15.270/2025)");
  avisos.push("Se atende PJ, o tomador retém 11% de INSS e recolhe 20% patronal — não simulado aqui");
  return fecharOpcao("PF", e, componentes, 0, reg?.debito ?? 0, avisos);
}

// ---------------------------------------------------------------------------
// Abrir PJ: tributos da empresa + retirada (pró-labore e dividendos)
// ---------------------------------------------------------------------------

function simularPjComProLabore(
  e: EntradaPessoaFisica,
  ano: AnoSimulacao,
  regime: RegimeSimulado,
  proLaboreMensal: number,
): OpcaoPessoaFisica {
  const entradaPj = comoEntradaPj(e, proLaboreMensal * 12);
  const cenario: Cenario =
    regime === "SIMPLES"
      ? simularSimples(entradaPj, ano)
      : regime === "SIMPLES_HIBRIDO"
        ? simularSimplesHibrido(entradaPj, ano)
        : simularLucroPresumido(entradaPj, ano);

  const inssSocioMes = INSS_SEGURADO_PRO_LABORE * Math.min(proLaboreMensal, TETO_INSS_MENSAL);
  const irpfPlMes = irpfMensal(proLaboreMensal, inssSocioMes + e.dependentes * DEDUCAO_DEPENDENTE_MENSAL);

  // Lucro que sobra para distribuir depois de despesas, tributos da PJ,
  // pró-labore e custo de manter a empresa.
  const lucro = Math.max(0, e.receitaAnual - e.despesasAnual - cenario.total - proLaboreMensal * 12 - e.custoManterPjAnual);
  const dividendosMes = lucro / 12;
  const irDividendosMes = dividendosMes > DIVIDENDOS_LIMITE_MENSAL ? dividendosMes * DIVIDENDOS_ALIQUOTA : 0;

  const componentes: Componente[] = [
    ...cenario.componentes.map((c) => ({ ...c, rotulo: `PJ: ${c.rotulo}` })),
    { rotulo: "Sócio: INSS 11% do pró-labore", valor: inssSocioMes * 12 },
    { rotulo: "Sócio: IRPF do pró-labore", valor: irpfPlMes * 12 },
    { rotulo: "Sócio: IR 10% sobre dividendos > R$ 50 mil/mês", valor: irDividendosMes * 12 },
  ];
  const avisos = [
    `Pró-labore de ${proLaboreMensal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês; dividendos de ${dividendosMes.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mês`,
    ...cenario.avisos,
  ];
  const opcao = fecharOpcao(regime, e, componentes, e.custoManterPjAnual, cenario.creditoGeradoCliente, avisos, {
    proLaboreMensal,
  });
  if (!cenario.elegivel) return { ...opcao, elegivel: false, motivoInelegivel: cenario.motivoInelegivel };
  return opcao;
}

/**
 * Para cada regime testa dois pró-labores e fica com o que deixa mais no
 * bolso: o salário mínimo e o necessário para o Fator R de 28% (Anexo III em
 * vez do V no Simples — o planejamento clássico de quem é sujeito ao Fator R).
 */
export function simularAbrirPj(e: EntradaPessoaFisica, ano: AnoSimulacao): OpcaoPessoaFisica[] {
  const proLaboreFatorR = Math.max(SALARIO_MINIMO, (0.28 * e.receitaAnual) / 12);
  const candidatos = e.sujeitoFatorR ? [SALARIO_MINIMO, proLaboreFatorR] : [SALARIO_MINIMO];
  return (["SIMPLES", "SIMPLES_HIBRIDO", "LUCRO_PRESUMIDO"] as const).map((regime) => {
    const opcoes = candidatos.map((pl) => simularPjComProLabore(e, ano, regime, pl));
    const elegiveis = opcoes.filter((o) => o.elegivel);
    if (elegiveis.length === 0) return opcoes[0];
    return elegiveis.reduce((a, b) => (b.liquidoEfetivo > a.liquidoEfetivo + 0.005 ? b : a));
  });
}

export function simularPessoaFisica(e: EntradaPessoaFisica, ano: AnoSimulacao): OpcaoPessoaFisica[] {
  return [simularContinuarPF(e, ano), ...simularAbrirPj(e, ano)];
}

export function melhorOpcaoPF(opcoes: OpcaoPessoaFisica[]): OpcaoPessoaFisica | null {
  const elegiveis = opcoes.filter((o) => o.elegivel);
  if (elegiveis.length === 0) return null;
  return elegiveis.reduce((a, b) => (b.liquidoEfetivo > a.liquidoEfetivo + 0.005 ? b : a));
}

// ---------------------------------------------------------------------------
// Padrões e persistência (o que vai em reforma_analises.entrada.pf)
// ---------------------------------------------------------------------------

export const ENTRADA_PF_PADRAO: Omit<EntradaPessoaFisica, "receitaAnual" | "reducaoCbsIbs" | "sujeitoFatorR"> = {
  despesasAnual: 0,
  dependentes: 0,
  issAutonomoAnual: 0,
  custosCreditaveisPct: 0.05,
  percentualB2b: 0,
  aliquotaIssPj: 0.05,
  custoManterPjAnual: 0,
};

export const CAMPOS_PF_SALVOS = [
  "receitaAnual",
  "despesasAnual",
  "dependentes",
  "issAutonomoAnual",
  "reducaoCbsIbs",
  "custosCreditaveisPct",
  "percentualB2b",
  "sujeitoFatorR",
  "aliquotaIssPj",
  "custoManterPjAnual",
] as const satisfies readonly (keyof EntradaPessoaFisica)[];
