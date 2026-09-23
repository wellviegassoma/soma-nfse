import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ItemStatus = "OK" | "DIVERGENCIA" | "ERRO";

export type ResultadoItem = {
  companyId: string;
  status: ItemStatus;
  detalhes?: Record<string, unknown>;
};

// Cada rota de etapa da Rotina de Fechamento chama isso uma vez, no fim
// do processamento de todas as empresas daquela rodada — nunca por
// empresa individual, pra não ficar fazendo 1 insert em
// `rotina_fechamento_execucoes` por empresa. `executadoPor` fica nulo
// quando a chamada veio via `autorizarChamadaInterna()` (chat/curl, sem
// sessão de staff) — ver lib/internal-auth.ts.
export async function registrarExecucao(
  supabase: SupabaseClient,
  params: {
    etapa: string;
    competencia: string;
    executadoPor: string | null;
    itens: ResultadoItem[];
    // Capturado no início do processamento pela rota chamadora (antes do
    // loop pelas empresas) — sem isso, `iniciado_em` acabava gravado com
    // o `now()` do banco no momento do insert, ou seja, DEPOIS de
    // finalizado_em (o insert só acontece no fim de tudo).
    iniciadoEm: Date;
  },
): Promise<{ execucaoId: string }> {
  const { etapa, competencia, executadoPor, itens, iniciadoEm } = params;
  const sucessos = itens.filter((i) => i.status === "OK").length;
  const falhas = itens.length - sucessos;

  const { data: execucao, error: execucaoError } = await supabase
    .from("rotina_fechamento_execucoes")
    .insert({
      etapa,
      competencia,
      status: "CONCLUIDO",
      total_empresas: itens.length,
      sucessos,
      falhas,
      executado_por: executadoPor,
      iniciado_em: iniciadoEm.toISOString(),
      finalizado_em: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (execucaoError) throw execucaoError;

  if (itens.length > 0) {
    const { error: itensError } = await supabase.from("rotina_fechamento_itens").insert(
      itens.map((item) => ({
        execucao_id: execucao.id,
        company_id: item.companyId,
        status: item.status,
        detalhes: item.detalhes ?? {},
      })),
    );
    if (itensError) throw itensError;
  }

  return { execucaoId: execucao.id as string };
}

// Última rodada concluída de uma etapa/competência — usado pela UI da
// Central de Automação pra mostrar "última rodada: HH:mm, N ok / M
// divergência" sem precisar rodar de novo só pra ver o status.
export async function buscarUltimaExecucao(
  supabase: SupabaseClient,
  etapa: string,
  competencia: string,
) {
  const { data, error } = await supabase
    .from("rotina_fechamento_execucoes")
    .select("id, status, total_empresas, sucessos, falhas, iniciado_em, finalizado_em")
    .eq("etapa", etapa)
    .eq("competencia", competencia)
    .order("iniciado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}
