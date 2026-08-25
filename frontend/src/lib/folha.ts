import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { competenciasRbt12 } from "@/lib/faturamento";

export type FolhaMensal = { competencia: string; valor: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buscarFolhaMensal(
  supabase: SupabaseClient<any, any, any>,
  companyId: string,
): Promise<FolhaMensal[]> {
  const { data } = await supabase
    .from("folha_mensal")
    .select("competencia, valor")
    .eq("company_id", companyId);
  return (data ?? []).map((r) => ({ competencia: r.competencia, valor: Number(r.valor) }));
}

export type Fp12Resolvido = {
  fp12: number;
  estimado: boolean; // menos de 12 meses de folha informados — FP12 projetado
  mesesDisponiveis: number;
};

// FP12 (folha acumulada 12 meses) usa a mesma janela móvel do RBT12 —
// Fator R oficial é FP12 ÷ RBT12, ambos sobre os 12 meses anteriores à
// competência. Diferente do RBT12, não existe decaimento de valor manual
// aqui: a folha não tem fonte automática no sistema (não vem de nota
// nenhuma), então cada mês só entra na conta quando o contador preenche
// esse mês especificamente — sem histórico completo, projeta
// proporcionalmente pelos meses que já foram preenchidos.
export function resolverFp12(params: {
  competencia: string;
  folhaPorMes: (mes: string) => number | undefined;
  mesesComDados: Set<string>;
}): Fp12Resolvido {
  const meses12 = competenciasRbt12(params.competencia);
  const mesesDisponiveis = meses12.filter((m) => params.mesesComDados.has(m)).length;
  const historicoInsuficiente = mesesDisponiveis < 12;
  const fp12Bruto = meses12.reduce((acc, m) => acc + (params.folhaPorMes(m) ?? 0), 0);
  const fp12 =
    historicoInsuficiente && mesesDisponiveis > 0 ? (fp12Bruto / mesesDisponiveis) * 12 : fp12Bruto;
  return { fp12, estimado: historicoInsuficiente, mesesDisponiveis };
}

// Fator R = FP12 ÷ RBT12. `null` quando não dá pra calcular (RBT12 zerado
// ou nenhuma folha informada ainda) — chamador decide o fallback (Anexo
// III é o padrão oficial na ausência de informação de folha).
export function resolverFatorR(fp12: number, rbt12: number): number | null {
  if (rbt12 <= 0) return null;
  return fp12 / rbt12;
}
