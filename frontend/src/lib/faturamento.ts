import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type NotaFaturamento = {
  competencia: string; // "YYYY-MM"
  valor: number;
  cancelada: boolean;
};

type DpsRow = {
  valor: number;
  status: string;
  data_competencia: string;
  nfse: { status: string; access_key: string | null } | { status: string; access_key: string | null }[] | null;
};

type NotaDistribuidaRow = {
  chave_acesso: string | null;
  valor_servico: number | null;
  competencia: string | null;
  cancelada: boolean;
  direcao: string;
};

// Mesma lógica de unificação/dedup do admin/page.tsx (Visão geral), mas
// já filtrada por empresa — uma nota emitida pelo próprio soma-nfse, uma
// vez sincronizada do Sefin Nacional, também aparece em
// notas_distribuidas (mesma chave_acesso), então precisa dedup.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buscarFaturamentoMensal(
  supabase: SupabaseClient<any, any, any>,
  companyId: string,
): Promise<NotaFaturamento[]> {
  const [{ data: notas }, { data: distribuidas }] = await Promise.all([
    supabase
      .from("dps")
      .select("valor, status, data_competencia, nfse(status, access_key)")
      .eq("company_id", companyId),
    supabase
      .from("notas_distribuidas")
      .select("chave_acesso, valor_servico, competencia, cancelada, direcao")
      .eq("company_id", companyId)
      .eq("direcao", "saida"),
  ]);

  const vistos = new Set<string>();
  const unificadas: NotaFaturamento[] = [];

  for (const nota of (notas ?? []) as unknown as DpsRow[]) {
    if (nota.status !== "ACCEPTED") continue;
    const nfseArr = Array.isArray(nota.nfse) ? nota.nfse : nota.nfse ? [nota.nfse] : [];
    const chaveAcesso = nfseArr[0]?.access_key ?? null;
    const cancelada = nfseArr.some((n) => n.status === "CANCELADA");
    if (chaveAcesso) vistos.add(chaveAcesso);
    unificadas.push({
      competencia: nota.data_competencia.slice(0, 7),
      valor: Number(nota.valor),
      cancelada,
    });
  }

  for (const nota of (distribuidas ?? []) as NotaDistribuidaRow[]) {
    if (nota.chave_acesso && vistos.has(nota.chave_acesso)) continue;
    if (nota.chave_acesso) vistos.add(nota.chave_acesso);
    unificadas.push({
      competencia: (nota.competencia ?? "").slice(0, 7),
      valor: Number(nota.valor_servico ?? 0),
      cancelada: nota.cancelada,
    });
  }

  return unificadas;
}

export function somarFaturamento(notas: NotaFaturamento[], competencias: string[]): number {
  const alvo = new Set(competencias);
  return notas
    .filter((n) => !n.cancelada && alvo.has(n.competencia))
    .reduce((acc, n) => acc + n.valor, 0);
}

// "YYYY-MM" dos 12 meses ANTERIORES à competência informada (RBT12 nunca
// inclui o próprio mês de apuração — regra oficial do Simples Nacional).
export function competenciasRbt12(competenciaAlvo: string): string[] {
  const [ano, mes] = competenciaAlvo.split("-").map(Number);
  const out: string[] = [];
  for (let i = 1; i <= 12; i++) {
    const d = new Date(Date.UTC(ano, mes - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

// "YYYY-MM" dos 3 meses do trimestre civil ao qual a competência pertence
// (jan-mar, abr-jun, jul-set, out-dez) — usado no Lucro Presumido, que
// apura IRPJ/CSLL por trimestre.
export function competenciasTrimestre(competencia: string): string[] {
  const [ano, mes] = competencia.split("-").map(Number);
  const primeiroMes = Math.floor((mes - 1) / 3) * 3 + 1;
  return [0, 1, 2].map((i) => `${ano}-${String(primeiroMes + i).padStart(2, "0")}`);
}

// Diferença em meses entre duas competências "YYYY-MM" (b − a). Positivo
// quando b é depois de a.
function diferencaEmMeses(a: string, b: string): number {
  const [anoA, mesA] = a.split("-").map(Number);
  const [anoB, mesB] = b.split("-").map(Number);
  return (anoB - anoA) * 12 + (mesB - mesA);
}

// "YYYY-MM" de todo mês entre `inicio` (incluso) e `fimExclusivo` (não
// incluso), assumindo fimExclusivo >= inicio.
function mesesEntre(inicio: string, fimExclusivo: string): string[] {
  const n = diferencaEmMeses(inicio, fimExclusivo);
  const [ano, mes] = inicio.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(ano, mes - 1 + i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export type Rbt12Resolvido = {
  rbt12: number;
  estimado: boolean;
  usandoManual: boolean;
  manualRolando: boolean;
  manualNaoAplicavel: boolean;
  mesesDisponiveis: number;
};

// Resolve o RBT12 pra uma competência: usa o faturamento dos 12 meses
// anteriores já registrado no sistema; se o histórico for insuficiente
// (empresa nova no sistema, mesmo que já faturasse antes por fora),
// combina o RBT12 manual configurado na empresa (informado uma vez, pra
// uma competência de referência) com o faturamento real do sistema desde
// então — sem precisar reinformar todo mês.
//
// RBT12 é uma janela móvel de 12 meses. Informado o valor pra uma
// competência de referência R, pra qualquer competência X depois de R o
// valor de R vai "saindo" da janela gradualmente (perde 1/12 do peso por
// mês) enquanto o faturamento real dos meses entre R e X (esse sim,
// exato, vindo do sistema) vai entrando — depois de 12 meses o valor de
// R já não pesa nada e o sistema passa a usar só a própria história, sem
// precisar mais do manual. Pra competência igual à referência, usa o
// valor manual direto; pra competência ANTES da referência, o manual não
// se aplica (não tem como "voltar no tempo").
export function resolverRbt12(params: {
  competencia: string;
  receitaPorMes: (mes: string) => number;
  mesesComDados: Set<string>;
  rbt12Manual: number | null;
  rbt12ManualCompetencia: string | null;
}): Rbt12Resolvido {
  const meses12 = competenciasRbt12(params.competencia);
  const mesesDisponiveis = meses12.filter((m) => params.mesesComDados.has(m)).length;
  const historicoInsuficiente = mesesDisponiveis < 12;
  const rbt12Bruto = meses12.reduce((acc, m) => acc + params.receitaPorMes(m), 0);
  const rbt12EstimadoPeloSistema =
    historicoInsuficiente && mesesDisponiveis > 0 ? (rbt12Bruto / mesesDisponiveis) * 12 : rbt12Bruto;

  const temManual = params.rbt12Manual != null && params.rbt12ManualCompetencia != null;
  const n = temManual
    ? diferencaEmMeses(params.rbt12ManualCompetencia!, params.competencia)
    : null;

  // n === 0: competência de referência exata. 1..11: janela rolando
  // (mistura manual decrescente + real crescente). >=12: manual já saiu
  // 100% da janela, não pesa mais nada. <0: competência é antes da
  // referência, não dá pra aplicar.
  if (historicoInsuficiente && temManual && n !== null && n >= 0 && n < 12) {
    const pesoManual = (12 - n) / 12;
    const mesesReais = n === 0 ? [] : mesesEntre(params.rbt12ManualCompetencia!, params.competencia);
    const receitaReal = mesesReais.reduce((acc, m) => acc + params.receitaPorMes(m), 0);
    const rbt12 = params.rbt12Manual! * pesoManual + receitaReal;
    return {
      rbt12,
      estimado: false,
      usandoManual: n === 0,
      manualRolando: n > 0,
      manualNaoAplicavel: false,
      mesesDisponiveis,
    };
  }

  const manualNaoAplicavel = historicoInsuficiente && temManual && n !== null && n < 0;
  return {
    rbt12: rbt12EstimadoPeloSistema,
    estimado: historicoInsuficiente,
    usandoManual: false,
    manualRolando: false,
    manualNaoAplicavel,
    mesesDisponiveis,
  };
}
