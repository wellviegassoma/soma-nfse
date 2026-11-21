import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type AgregadoNotasDistribuidasRow = {
  company_id: string;
  competencia: string;
  faturamento: number;
  faturamento_hospitalar: number;
  notas_count: number;
  notas_canceladas_count: number;
};

// dashboard_agregado_notas_distribuidas devolve uma linha por
// empresa/mês. Passou de 1000 linhas (1.527 em 20/11/2026) e a API corta
// toda resposta em 1000 — paginada com ordem única (empresa, mês).
export function buscarAgregadoNotasDistribuidas(
  supabase: Supa,
  chavesExcluir: string[],
): Promise<AgregadoNotasDistribuidasRow[]> {
  return buscarTudoPaginado<AgregadoNotasDistribuidasRow>((from, to) =>
    supabase
      .rpc("dashboard_agregado_notas_distribuidas", { p_chaves_excluir: chavesExcluir })
      .order("company_id")
      .order("competencia")
      .range(from, to),
  );
}

// Lista de chaves vai na URL (filtro "in") — em blocos, pra não estourar
// o tamanho da URL conforme as notas emitidas pelo sistema crescem.
const CHAVES_POR_CONSULTA = 50;

export async function buscarEquiparacaoPorChaves(
  supabase: Supa,
  chaves: string[],
): Promise<{ chave_acesso: string; equiparacao_hospitalar: boolean }[]> {
  const blocos: string[][] = [];
  for (let i = 0; i < chaves.length; i += CHAVES_POR_CONSULTA) blocos.push(chaves.slice(i, i + CHAVES_POR_CONSULTA));
  const partes = await Promise.all(
    blocos.map((bloco) =>
      buscarTudoPaginado<{ chave_acesso: string; equiparacao_hospitalar: boolean }>((from, to) =>
        supabase
          .from("notas_distribuidas")
          .select("chave_acesso, equiparacao_hospitalar")
          .in("chave_acesso", bloco)
          .order("id")
          .range(from, to),
      ),
    ),
  );
  return partes.flat();
}
