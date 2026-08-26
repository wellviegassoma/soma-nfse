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
export async function buscarFaturamentoMensal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// Faturamento manual, informado mês a mês — normalmente pra competências
// anteriores à empresa existir no sistema (sem nota emitida/distribuída
// aqui), mas também serve como CORREÇÃO/override de um mês que já tem
// nota: a distribuição de notas do Sefin Nacional só passou a funcionar
// de forma confiável a partir de dezembro/2025, então meses reais
// anteriores a isso podem estar incompletos mesmo com nota "encontrada"
// no sistema. Quando informado, o manual sempre tem prioridade sobre o
// real (ver `receitaComManual`) — mesmo padrão de `buscarFolhaMensal`,
// mas pra receita.
export async function buscarReceitaManual(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  companyId: string,
): Promise<Map<string, number>> {
  const { data } = await supabase
    .from("receita_mensal_manual")
    .select("competencia, valor")
    .eq("company_id", companyId);
  return new Map((data ?? []).map((r) => [r.competencia as string, Number(r.valor)]));
}

export function somarFaturamento(notas: NotaFaturamento[], competencias: string[]): number {
  const alvo = new Set(competencias);
  return notas
    .filter((n) => !n.cancelada && alvo.has(n.competencia))
    .reduce((acc, n) => acc + n.valor, 0);
}

// Combina o faturamento real (notas) com o manual (`buscarReceitaManual`)
// numa única fonte pra `resolverRbt12`: o manual, quando informado,
// SEMPRE tem prioridade sobre o real — normalmente preenche competências
// sem nenhuma nota, mas também serve pra corrigir um mês que já tem nota
// (útil pra competências anteriores a dezembro/2025, quando a
// distribuição de notas do Sefin Nacional ainda era parcial e pode ter
// ficado incompleta mesmo tendo "encontrado" alguma nota).
export function receitaComManual(
  notas: NotaFaturamento[],
  receitaManualPorMes: Map<string, number>,
): { receitaPorMes: (mes: string) => number; mesesComDados: Set<string>; mesesManuais: Set<string> } {
  const mesesComDadosReal = new Set(notas.filter((n) => !n.cancelada).map((n) => n.competencia));
  const mesesManuais = new Set(receitaManualPorMes.keys());
  const mesesComDados = new Set([...mesesComDadosReal, ...mesesManuais]);
  const receitaPorMes = (mes: string) =>
    receitaManualPorMes.has(mes) ? receitaManualPorMes.get(mes)! : somarFaturamento(notas, [mes]);
  return { receitaPorMes, mesesComDados, mesesManuais };
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

export type Rbt12Resolvido = {
  rbt12: number;
  estimado: boolean;
  mesesDisponiveis: number;
  // quantos dos meses usados vieram de faturamento manual (não de nota
  // real) — só informativo, pra UI avisar quando o valor depende de
  // dado digitado à mão em vez de nota emitida.
  mesesManuais: number;
  // true = RBT12 é a projeção proporcional oficial (empresa com menos de
  // 12 meses de existência, não uma estimativa por falta de dado — ver
  // resolverRbt12).
  empresaNova: boolean;
};

// Resolve o RBT12 pra uma competência.
//
// Primeiro verifica se a empresa é realmente NOVA (menos de 12 meses de
// existência, pela data de abertura do CNPJ): nesse caso, a regra
// oficial do Simples Nacional é projetar proporcionalmente o
// faturamento real desde a abertura (RBT12 = média mensal × 12) — não é
// uma estimativa por falta de dado, é a fórmula certa por lei.
//
// Se a empresa NÃO é nova (data de abertura desconhecida, ou já tem 12+
// meses), soma o faturamento dos 12 meses anteriores — `receitaPorMes`
// já entrega, pra cada mês, o real (quando tem nota) ou o manual
// informado pra competências anteriores à empresa existir no sistema
// (quando não tem); ver `buscarReceitaManual`. Como cada mês entra na
// conta individualmente, a janela móvel rola sozinha por construção: no
// mês seguinte, o mês mais antigo sai e o novo entra, sem nenhum
// decaimento ou "competência de referência" — é só a soma dos últimos
// 12 meses, exatamente como a regra oficial pede. Se `mesesComDados`
// (real + manual) não cobrir os 12 meses, projeta proporcionalmente
// pelos meses que cobrir.
export function resolverRbt12(params: {
  competencia: string;
  receitaPorMes: (mes: string) => number;
  mesesComDados: Set<string>;
  mesesManuais?: Set<string>;
  dataAbertura: string | null; // "YYYY-MM-DD"
}): Rbt12Resolvido {
  const meses12 = competenciasRbt12(params.competencia); // mais recente primeiro

  if (params.dataAbertura) {
    const competenciaAbertura = params.dataAbertura.slice(0, 7);
    const mesesDeExistencia = Math.max(0, diferencaEmMeses(competenciaAbertura, params.competencia));
    if (mesesDeExistencia < 12) {
      if (mesesDeExistencia === 0) {
        // Abertura é no próprio mês da competência — não tem "mês
        // anterior" nenhum ainda; usa a receita do próprio mês como
        // única base disponível pra projeção.
        const receitaMes = params.receitaPorMes(params.competencia);
        return {
          rbt12: receitaMes * 12,
          estimado: true,
          mesesDisponiveis: 0,
          mesesManuais: 0,
          empresaNova: true,
        };
      }
      const mesesConsiderados = meses12.slice(0, mesesDeExistencia);
      const receitaDesdeAbertura = mesesConsiderados.reduce((acc, m) => acc + params.receitaPorMes(m), 0);
      return {
        rbt12: (receitaDesdeAbertura / mesesDeExistencia) * 12,
        estimado: true,
        mesesDisponiveis: mesesDeExistencia,
        mesesManuais: 0,
        empresaNova: true,
      };
    }
  }

  const mesesDisponiveis = meses12.filter((m) => params.mesesComDados.has(m)).length;
  const mesesManuais = meses12.filter((m) => params.mesesManuais?.has(m)).length;
  const historicoInsuficiente = mesesDisponiveis < 12;
  const rbt12Bruto = meses12.reduce((acc, m) => acc + params.receitaPorMes(m), 0);
  const rbt12 =
    historicoInsuficiente && mesesDisponiveis > 0 ? (rbt12Bruto / mesesDisponiveis) * 12 : rbt12Bruto;

  return {
    rbt12,
    estimado: historicoInsuficiente,
    mesesDisponiveis,
    mesesManuais,
    empresaNova: false,
  };
}
