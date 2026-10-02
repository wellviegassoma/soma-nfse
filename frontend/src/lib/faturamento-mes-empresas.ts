import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import { proximaCompetencia } from "@/lib/competencia";

type DpsRow = {
  company_id: string;
  valor: number;
  status: string;
  nfse: { status: string; access_key: string | null } | { status: string; access_key: string | null }[] | null;
};

// Faturamento (não cancelado) de uma competência "YYYY-MM" por empresa,
// mesma fonte e regra de dedup da Visão geral: notas emitidas pelo
// soma-nfse (dps) + notas_distribuidas, ignorando as chaves já cobertas por
// dps pra não contar a mesma nota duas vezes.
export async function faturamentoDoMesPorEmpresa(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  competencia: string,
): Promise<Map<string, number>> {
  const inicio = `${competencia}-01`;
  const fim = `${proximaCompetencia(competencia)}-01`;

  const dpsRows = await buscarTudoPaginado<DpsRow>((from, to) =>
    supabase
      .from("dps")
      .select("company_id, valor, status, nfse(status, access_key)")
      .gte("data_competencia", inicio)
      .lt("data_competencia", fim)
      .range(from, to),
  );

  const porEmpresa = new Map<string, number>();
  const chaves: string[] = [];
  for (const nota of dpsRows) {
    if (nota.status !== "ACCEPTED") continue;
    const nfseArr = Array.isArray(nota.nfse) ? nota.nfse : nota.nfse ? [nota.nfse] : [];
    const chave = nfseArr[0]?.access_key ?? null;
    if (chave) chaves.push(chave);
    if (nfseArr.some((n) => n.status === "CANCELADA")) continue;
    porEmpresa.set(nota.company_id, (porEmpresa.get(nota.company_id) ?? 0) + Number(nota.valor));
  }

  // Direto em notas_distribuidas (um mês só, paginado e com ordem estável) —
  // a RPC de agregação devolve todas as empresas/meses de uma vez e bate no
  // limite de 1000 linhas do PostgREST sem avisar.
  const distribuidas = await buscarTudoPaginado<{
    company_id: string;
    chave_acesso: string | null;
    valor_servico: number | null;
  }>((from, to) =>
    supabase
      .from("notas_distribuidas")
      .select("company_id, chave_acesso, valor_servico")
      .eq("direcao", "saida")
      .eq("cancelada", false)
      .gte("competencia", inicio)
      .lt("competencia", fim)
      .order("id")
      .range(from, to),
  );
  const chavesDps = new Set(chaves);
  for (const nota of distribuidas) {
    if (nota.chave_acesso && chavesDps.has(nota.chave_acesso)) continue;
    porEmpresa.set(nota.company_id, (porEmpresa.get(nota.company_id) ?? 0) + Number(nota.valor_servico ?? 0));
  }

  return porEmpresa;
}
