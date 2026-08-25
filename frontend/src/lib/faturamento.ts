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

export type Rbt12Resolvido = {
  rbt12: number;
  estimado: boolean;
  usandoManual: boolean;
  manualDesatualizado: boolean;
  mesesDisponiveis: number;
};

// Resolve o RBT12 pra uma competência: usa o faturamento dos 12 meses
// anteriores já registrado no sistema; se o histórico for insuficiente
// (empresa nova no sistema, mesmo que já faturasse antes por fora),
// prioriza o RBT12 manual configurado na empresa — senão projeta
// proporcionalmente pelos meses disponíveis. Mesma lógica usada tanto na
// aba Impostos de uma empresa quanto na Visão geral (todas de uma vez).
//
// RBT12 é uma janela móvel — muda todo mês — então o valor manual só
// serve pra competência em que foi de fato apurado (rbt12ManualCompetencia).
// Fora disso ele fica desatualizado; nunca é reaplicado silenciosamente
// (bug real corrigido: alíquota de um mês saindo igual à do mês anterior
// porque o manual tinha ficado parado).
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

  const manualValido =
    historicoInsuficiente &&
    params.rbt12Manual != null &&
    params.rbt12ManualCompetencia === params.competencia;
  const manualDesatualizado =
    historicoInsuficiente &&
    params.rbt12Manual != null &&
    params.rbt12ManualCompetencia !== params.competencia;

  const rbt12 = manualValido ? params.rbt12Manual! : rbt12EstimadoPeloSistema;
  return {
    rbt12,
    estimado: historicoInsuficiente && !manualValido,
    usandoManual: manualValido,
    manualDesatualizado,
    mesesDisponiveis,
  };
}
