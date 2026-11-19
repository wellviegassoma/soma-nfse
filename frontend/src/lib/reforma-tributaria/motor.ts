// Motor do simulador da Reforma Tributária — cálculo ANUAL, por ano da
// transição (2026-2033), dos três caminhos que um cliente de serviço da
// SOMA tem:
//
//   1. Simples Nacional "puro": CBS/IBS dentro do DAS. A alíquota do DAS
//      não muda — a fatia de PIS/COFINS vira CBS em 2027 e a fatia de ISS
//      vira IBS aos poucos (2029-2033). O cliente PJ que compra dele só
//      credita o CBS/IBS que está dentro do DAS (pouco).
//   2. Simples Nacional "híbrido" (opção a partir de 2027, LC 214 art. 41):
//      IRPJ/CSLL/CPP (e o ISS remanescente) no DAS, CBS/IBS por fora no
//      regime regular — paga mais, mas gera crédito cheio para o cliente PJ.
//   3. Lucro Presumido: IRPJ/CSLL presumidos + PIS/COFINS cumulativos até
//      2026, CBS/IBS regular a partir de 2027, ISS em extinção, e INSS
//      patronal sobre a folha (fora do DAS).
//
// "Carga efetiva" = tributo pago − crédito que o cliente PJ aproveita
// (× % da receita vinda de clientes que creditam). Para clínica que atende
// paciente pessoa física, % B2B = 0 e a carga efetiva é só o tributo pago.
// Para quem vende para empresas do regime regular, o crédito gerado vale
// dinheiro na negociação de preço — é o que pode fazer o híbrido ou o
// Presumido ganhar do Simples.
//
// É simulação para planejamento (a Portaria Cotec 342/2026 diz que nem a
// calculadora oficial tem efeito vinculante). Simplificações assumidas e
// mostradas na tela: receita constante no ano; créditos de CBS/IBS sobre
// compras à alíquota cheia (fornecedor no regime regular); Lucro Real e
// Anexos I, II e IV não simulados.

import { calcularSimplesNacional } from "@/lib/calculo-impostos";
import {
  ALIQUOTAS_REFERENCIA,
  ENCARGO_PATRONAL_PRO_LABORE,
  ENCARGO_PATRONAL_SALARIOS,
  FATOR_ISS_ICMS,
  LIMITE_LUCRO_PRESUMIDO,
  LIMITE_SIMPLES,
  cbsIbsCobradoNoAno,
  pisCofinsExisteNoAno,
  type AnoSimulacao,
} from "@/lib/reforma-tributaria/parametros";

export type RegimeSimulado = "SIMPLES" | "SIMPLES_HIBRIDO" | "LUCRO_PRESUMIDO";

export const NOME_REGIME: Record<RegimeSimulado, string> = {
  SIMPLES: "Simples Nacional",
  SIMPLES_HIBRIDO: "Simples híbrido (CBS/IBS por fora)",
  LUCRO_PRESUMIDO: "Lucro Presumido",
};

export type EntradaSimulacao = {
  receitaAnual: number;
  // Parte da receita com equiparação hospitalar (presunção 8%/12% no LP).
  receitaHospitalarAnual: number;
  salariosAnual: number;
  proLaboreAnual: number;
  fgtsAnual: number;
  // Anexo III × V pelo Fator R (folha ÷ receita ≥ 28% → III).
  sujeitoFatorR: boolean;
  // Atividade do Anexo IV (CPP fora do DAS) — Simples não simulado.
  anexoIV?: boolean;
  // ISS fora do Simples: percentual sobre a receita OU fixo anual (uniprofissional).
  aliquotaIss: number; // fração
  issFixoAnual: number | null;
  // Redução de CBS/IBS pela classificação do serviço (cClassTrib).
  reducaoCbsIbs: number; // fração 0..1
  // Compras/despesas com CBS/IBS destacado que dão crédito no regime regular.
  custosCreditaveisPct: number; // fração da receita
  // Receita vinda de clientes PJ que aproveitam crédito de CBS/IBS.
  percentualB2b: number; // fração 0..1
};

export type Componente = { rotulo: string; valor: number; destaque?: "novo" | "saindo" };

export type Cenario = {
  regime: RegimeSimulado;
  elegivel: boolean;
  motivoInelegivel?: string;
  componentes: Componente[];
  total: number;
  aliquotaEfetiva: number;
  creditoGeradoCliente: number;
  cargaEfetiva: number;
  avisos: string[];
};

function folhaComEncargos(e: EntradaSimulacao) {
  return e.salariosAnual + e.proLaboreAnual + e.fgtsAnual;
}

export function fatorR(e: EntradaSimulacao): number | null {
  return e.receitaAnual > 0 ? folhaComEncargos(e) / e.receitaAnual : null;
}

function aliquotaCbsIbs(ano: AnoSimulacao, reducao: number) {
  const a = ALIQUOTAS_REFERENCIA[ano];
  const f = 1 - Math.min(Math.max(reducao, 0), 1);
  return { cbs: a.cbs * f, ibs: (a.ibsUf + a.ibsMun) * f, cbsCheia: a.cbs, ibsCheia: a.ibsUf + a.ibsMun };
}

// CBS/IBS no regime regular: débito sobre a receita − crédito sobre compras.
function cbsIbsRegular(e: EntradaSimulacao, ano: AnoSimulacao) {
  if (!cbsIbsCobradoNoAno(ano)) return { cbs: 0, ibs: 0, debito: 0, credito: 0 };
  const al = aliquotaCbsIbs(ano, e.reducaoCbsIbs);
  const baseCompras = e.receitaAnual * e.custosCreditaveisPct;
  const debCbs = e.receitaAnual * al.cbs;
  const debIbs = e.receitaAnual * al.ibs;
  const credCbs = baseCompras * al.cbsCheia;
  const credIbs = baseCompras * al.ibsCheia;
  return {
    cbs: Math.max(0, debCbs - credCbs),
    ibs: Math.max(0, debIbs - credIbs),
    debito: debCbs + debIbs,
    credito: credCbs + credIbs,
  };
}

function issForaDoSimples(e: EntradaSimulacao, ano: AnoSimulacao) {
  const cheio = e.issFixoAnual != null ? e.issFixoAnual : e.receitaAnual * e.aliquotaIss;
  return cheio * FATOR_ISS_ICMS[ano];
}

function fechar(
  regime: RegimeSimulado,
  e: EntradaSimulacao,
  componentes: Componente[],
  creditoGeradoCliente: number,
  avisos: string[],
  elegibilidade: { elegivel: boolean; motivo?: string },
): Cenario {
  const visiveis = componentes.filter((c) => Math.abs(c.valor) >= 0.005);
  const total = visiveis.reduce((acc, c) => acc + c.valor, 0);
  return {
    regime,
    elegivel: elegibilidade.elegivel,
    motivoInelegivel: elegibilidade.motivo,
    componentes: visiveis,
    total,
    aliquotaEfetiva: e.receitaAnual > 0 ? total / e.receitaAnual : 0,
    creditoGeradoCliente,
    cargaEfetiva: total - creditoGeradoCliente * e.percentualB2b,
    avisos,
  };
}

function dasBase(e: EntradaSimulacao) {
  const fr = fatorR(e);
  return calcularSimplesNacional({
    receitaMes: e.receitaAnual,
    rbt12: e.receitaAnual,
    rbt12Estimado: false,
    sujeitoFatorR: e.sujeitoFatorR,
    fatorRPercentual: fr,
  });
}

function elegibilidadeSimples(e: EntradaSimulacao) {
  if (e.anexoIV) return { elegivel: false, motivo: "Atividade do Anexo IV (CPP fora do DAS) — não simulado" };
  return e.receitaAnual > LIMITE_SIMPLES
    ? { elegivel: false, motivo: "Receita acima de R$ 4,8 milhões/ano" }
    : { elegivel: true };
}

export function simularSimples(e: EntradaSimulacao, ano: AnoSimulacao): Cenario {
  const das = dasBase(e);
  const p = das.partilha;
  const fator = FATOR_ISS_ICMS[ano];
  const pisCofins = p.pis + p.cofins;
  const reforma = cbsIbsCobradoNoAno(ano);
  const avisos: string[] = [`Anexo ${das.anexo}, faixa ${das.faixa} — alíquota efetiva ${(das.aliquotaEfetiva * 100).toFixed(2)}%`];
  const componentes: Componente[] = [
    { rotulo: "IRPJ (no DAS)", valor: p.irpj },
    { rotulo: "CSLL (no DAS)", valor: p.csll },
    { rotulo: "CPP — INSS patronal (no DAS)", valor: p.cpp },
    reforma
      ? { rotulo: "CBS (no DAS, no lugar de PIS/COFINS)", valor: pisCofins, destaque: "novo" }
      : { rotulo: "PIS/COFINS (no DAS)", valor: pisCofins },
    { rotulo: "ISS (no DAS)", valor: p.iss * fator, destaque: fator < 1 ? "saindo" : undefined },
    { rotulo: "IBS (no DAS, no lugar do ISS)", valor: reforma ? p.iss * (1 - fator) : 0, destaque: "novo" },
  ];
  if (das.faixa === 6) {
    componentes.push({ rotulo: "ISS fora do DAS (acima do sublimite)", valor: issForaDoSimples(e, ano) });
    avisos.push("Acima do sublimite de R$ 3,6 mi: ISS recolhido fora do DAS");
  }
  // Planejamento clássico: no Anexo V por pouco, aumentar pró-labore leva ao III.
  const fr = fatorR(e);
  if (e.sujeitoFatorR && fr != null && fr < 0.28) {
    const falta = 0.28 * e.receitaAnual - folhaComEncargos(e);
    avisos.push(
      `Fator R ${(fr * 100).toFixed(1)}%: faltam ${falta.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}/ano de folha para o Anexo III`,
    );
  }
  // Cliente PJ credita só o CBS/IBS efetivamente dentro do DAS.
  const credito = reforma ? pisCofins + p.iss * (1 - fator) : 0;
  return fechar("SIMPLES", e, componentes, credito, avisos, elegibilidadeSimples(e));
}

export function simularSimplesHibrido(e: EntradaSimulacao, ano: AnoSimulacao): Cenario {
  if (!cbsIbsCobradoNoAno(ano)) {
    return fechar("SIMPLES_HIBRIDO", e, [], 0, [], {
      elegivel: false,
      motivo: "Opção pelo CBS/IBS por fora só existe a partir de 2027",
    });
  }
  const das = dasBase(e);
  const p = das.partilha;
  const fator = FATOR_ISS_ICMS[ano];
  const reg = cbsIbsRegular(e, ano);
  const componentes: Componente[] = [
    { rotulo: "IRPJ (no DAS)", valor: p.irpj },
    { rotulo: "CSLL (no DAS)", valor: p.csll },
    { rotulo: "CPP — INSS patronal (no DAS)", valor: p.cpp },
    { rotulo: "ISS (no DAS)", valor: p.iss * fator, destaque: fator < 1 ? "saindo" : undefined },
    { rotulo: "CBS regular (débito − crédito)", valor: reg.cbs, destaque: "novo" },
    { rotulo: "IBS regular (débito − crédito)", valor: reg.ibs, destaque: "novo" },
  ];
  if (das.faixa === 6) componentes.push({ rotulo: "ISS fora do DAS (acima do sublimite)", valor: issForaDoSimples(e, ano) });
  const avisos = [`Anexo ${das.anexo}, faixa ${das.faixa}; CBS/IBS com crédito de ${(reg.credito > 0 ? (reg.credito / Math.max(reg.debito, 1)) * 100 : 0).toFixed(0)}% do débito`];
  return fechar("SIMPLES_HIBRIDO", e, componentes, reg.debito, avisos, elegibilidadeSimples(e));
}

// LC 224/2025: presunção do Lucro Presumido +10% sobre a parcela da receita
// bruta anual que passar de R$ 5 milhões (a partir de 2026).
const LIMITE_ACRESCIMO_PRESUNCAO = 5_000_000;
const ACRESCIMO_PRESUNCAO = 1.1;

function basePresumida(receita: number, presuncao: number) {
  const ate = Math.min(receita, LIMITE_ACRESCIMO_PRESUNCAO);
  const acima = Math.max(0, receita - LIMITE_ACRESCIMO_PRESUNCAO);
  return ate * presuncao + acima * presuncao * ACRESCIMO_PRESUNCAO;
}

export function simularLucroPresumido(e: EntradaSimulacao, ano: AnoSimulacao): Cenario {
  const hosp = Math.min(Math.max(e.receitaHospitalarAnual, 0), e.receitaAnual);
  const geral = e.receitaAnual - hosp;
  // Proporção da receita acima de R$ 5 mi aplicada às duas fatias.
  const fatorGeral = e.receitaAnual > 0 ? geral / e.receitaAnual : 0;
  const fatorHosp = e.receitaAnual > 0 ? hosp / e.receitaAnual : 0;
  const baseIrpj =
    basePresumida(e.receitaAnual, 0.32) * fatorGeral + basePresumida(e.receitaAnual, 0.08) * fatorHosp;
  const baseCsll =
    basePresumida(e.receitaAnual, 0.32) * fatorGeral + basePresumida(e.receitaAnual, 0.12) * fatorHosp;
  const irpj = baseIrpj * 0.15;
  const adicional = Math.max(0, baseIrpj - 240_000) * 0.1;
  const csll = baseCsll * 0.09;
  const pisCofins = pisCofinsExisteNoAno(ano) ? e.receitaAnual * (0.0065 + 0.03) : 0;
  const iss = issForaDoSimples(e, ano);
  const reg = cbsIbsRegular(e, ano);
  const cpp = e.salariosAnual * ENCARGO_PATRONAL_SALARIOS + e.proLaboreAnual * ENCARGO_PATRONAL_PRO_LABORE;
  const componentes: Componente[] = [
    { rotulo: "IRPJ (15%)", valor: irpj },
    { rotulo: "Adicional IRPJ (10%)", valor: adicional },
    { rotulo: "CSLL (9%)", valor: csll },
    { rotulo: "PIS/COFINS cumulativo (3,65%)", valor: pisCofins },
    { rotulo: "ISS", valor: iss, destaque: FATOR_ISS_ICMS[ano] < 1 ? "saindo" : undefined },
    { rotulo: "CBS (débito − crédito)", valor: reg.cbs, destaque: "novo" },
    { rotulo: "IBS (débito − crédito)", valor: reg.ibs, destaque: "novo" },
    { rotulo: "INSS patronal sobre folha", valor: cpp },
  ];
  const avisos: string[] = [];
  if (hosp > 0) avisos.push("Equiparação hospitalar aplicada na fatia marcada (presunção 8%/12%)");
  if (e.receitaAnual > LIMITE_ACRESCIMO_PRESUNCAO) avisos.push("Receita > R$ 5 mi: presunção +10% no excedente (LC 224/2025)");
  if (cpp > 0) avisos.push("INSS patronal estimado com RAT 2% e Terceiros 5,8% — conferir FAP/CNAE");
  const eleg =
    e.receitaAnual > LIMITE_LUCRO_PRESUMIDO
      ? { elegivel: false, motivo: "Receita acima de R$ 78 milhões/ano" }
      : { elegivel: true };
  return fechar("LUCRO_PRESUMIDO", e, componentes, reg.debito, avisos, eleg);
}

export function simularTodos(e: EntradaSimulacao, ano: AnoSimulacao): Cenario[] {
  return [simularSimples(e, ano), simularSimplesHibrido(e, ano), simularLucroPresumido(e, ano)];
}

export function melhorCenario(cenarios: Cenario[]): Cenario | null {
  const elegiveis = cenarios.filter((c) => c.elegivel);
  if (elegiveis.length === 0) return null;
  return elegiveis.reduce((a, b) => (b.cargaEfetiva < a.cargaEfetiva - 0.005 ? b : a));
}

// Regime cadastrado da empresa → cenário equivalente no simulador.
export function regimeAtualSimulado(taxRegime: string | null): RegimeSimulado | null {
  if (taxRegime === "SIMPLES_NACIONAL") return "SIMPLES";
  if (taxRegime === "LUCRO_PRESUMIDO") return "LUCRO_PRESUMIDO";
  return null;
}
