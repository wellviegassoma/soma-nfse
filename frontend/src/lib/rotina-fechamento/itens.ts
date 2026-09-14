import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type ItemExecucao = {
  companyId: string;
  nome: string;
  status: "OK" | "DIVERGENCIA" | "ERRO";
  detalhes: Record<string, unknown>;
};

// Usado pela tela da Central de Automação pra mostrar o detalhe por
// empresa da última rodada de uma etapa (ex.: quem ficou com
// divergência) — buscarUltimaExecucao() só traz o resumo agregado.
export async function buscarItensExecucao(supabase: Supa, execucaoId: string): Promise<ItemExecucao[]> {
  const { data, error } = await supabase
    .from("rotina_fechamento_itens")
    .select("company_id, status, detalhes, companies(legal_name, trade_name)")
    .eq("execucao_id", execucaoId);
  if (error) throw error;

  return (data ?? []).map((item) => {
    const empresa = Array.isArray(item.companies) ? item.companies[0] : item.companies;
    return {
      companyId: item.company_id,
      nome: empresa?.trade_name || empresa?.legal_name || item.company_id,
      status: item.status,
      detalhes: item.detalhes ?? {},
    };
  });
}
