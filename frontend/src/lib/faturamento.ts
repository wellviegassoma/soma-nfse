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

export type Rbt12Resolvido = {
  rbt12: number;
  estimado: boolean;
  usandoManual: boolean;
  manualNaoAplicavel: boolean;
  mesesDisponiveis: number;
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
// uma estimativa por falta de dado, é a fórmula certa por lei, e nem
// olha pro RBT12 manual (não faz sentido informar um "histórico" pra
// uma empresa que comprovadamente não existia há 12 meses).
//
// Se a empresa NÃO é nova (data de abertura desconhecida, ou já tem 12+
// meses), usa o faturamento dos 12 meses anteriores já registrado no
// sistema; se o histórico do SISTEMA for insuficiente (empresa antiga
// que só entrou recentemente no soma-nfse, por exemplo), usa o RBT12
// manual configurado na empresa (informado uma vez, pra uma competência
// de referência) CHEIO, sem misturar com o faturamento real do sistema —
// misturar deixaria o RBT12 artificialmente baixo enquanto o sistema
// ainda não tem os 12 meses completos (a pedido do usuário: usar sempre
// o valor manual cheio nesses meses de transição, nunca um blend).
// Assim que o sistema acumular os 12 meses reais, passa a usar só a
// própria história, sem depender mais do manual. Nunca projeta
// proporcionalmente nesse caso (seria a fórmula errada pra uma empresa
// que não é nova).
//
// O manual só se aplica da competência de referência R em diante — pra
// competência ANTES de R, não tem como "voltar no tempo" e ele não é
// usado.
export function resolverRbt12(params: {
  competencia: string;
  receitaPorMes: (mes: string) => number;
  mesesComDados: Set<string>;
  rbt12Manual: number | null;
  rbt12ManualCompetencia: string | null;
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
          usandoManual: false,
          manualNaoAplicavel: false,
          mesesDisponiveis: 0,
          empresaNova: true,
        };
      }
      const mesesConsiderados = meses12.slice(0, mesesDeExistencia);
      const receitaDesdeAbertura = mesesConsiderados.reduce((acc, m) => acc + params.receitaPorMes(m), 0);
      return {
        rbt12: (receitaDesdeAbertura / mesesDeExistencia) * 12,
        estimado: true,
        usandoManual: false,
        manualNaoAplicavel: false,
        mesesDisponiveis: mesesDeExistencia,
        empresaNova: true,
      };
    }
  }

  const mesesDisponiveis = meses12.filter((m) => params.mesesComDados.has(m)).length;
  const historicoInsuficiente = mesesDisponiveis < 12;
  const rbt12Bruto = meses12.reduce((acc, m) => acc + params.receitaPorMes(m), 0);
  const rbt12EstimadoPeloSistema =
    historicoInsuficiente && mesesDisponiveis > 0 ? (rbt12Bruto / mesesDisponiveis) * 12 : rbt12Bruto;

  const temManual = params.rbt12Manual != null && params.rbt12ManualCompetencia != null;
  const n = temManual
    ? diferencaEmMeses(params.rbt12ManualCompetencia!, params.competencia)
    : null;

  // n entre 0 e 11: dentro da janela de transição desde a competência de
  // referência — usa o manual cheio. >=12: já deu tempo de sobra pro
  // sistema ter os 12 meses reais (se ainda não tem, é porque faltam
  // meses sem faturamento mesmo, não porque a empresa é nova aqui — cai
  // no fallback abaixo). <0: competência é antes da referência, não dá
  // pra aplicar.
  if (historicoInsuficiente && temManual && n !== null && n >= 0 && n < 12) {
    return {
      rbt12: params.rbt12Manual!,
      estimado: false,
      usandoManual: true,
      manualNaoAplicavel: false,
      mesesDisponiveis,
      empresaNova: false,
    };
  }

  const manualNaoAplicavel = historicoInsuficiente && temManual && n !== null && n < 0;
  return {
    rbt12: rbt12EstimadoPeloSistema,
    estimado: historicoInsuficiente,
    usandoManual: false,
    manualNaoAplicavel,
    mesesDisponiveis,
    empresaNova: false,
  };
}
