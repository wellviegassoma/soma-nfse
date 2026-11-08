import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type OrigemFechamentoIss = "sistema" | "manual";

export type FechamentoIss = {
  companyId: string;
  competencia: string;
  origem: OrigemFechamentoIss;
  valorGuia: number | null;
  observacao: string | null;
  marcadoEm: string;
};

// Marca que a guia de ISS da competência saiu pelo sistema. Melhor
// esforço: a guia já foi emitida/baixada, então uma falha aqui só é
// registrada no log — nunca derruba a resposta da emissão.
export async function registrarFechamentoIssSistema(
  supabase: Supa,
  params: { companyId: string; competencia: string | null; valorGuia: number | null },
): Promise<void> {
  if (!params.competencia || !/^\d{4}-\d{2}$/.test(params.competencia)) return;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    const { error } = await supabase.from("iss_fechamentos").upsert(
      {
        company_id: params.companyId,
        competencia: params.competencia,
        origem: "sistema",
        valor_guia: params.valorGuia != null && Number.isFinite(params.valorGuia) ? params.valorGuia : null,
        observacao: null,
        marcado_em: new Date().toISOString(),
        marcado_por: user?.id ?? null,
      },
      { onConflict: "company_id,competencia" },
    );
    if (error) console.error("iss_fechamentos: falha ao registrar", error.message);
  } catch (e) {
    console.error("iss_fechamentos: falha ao registrar", e);
  }
}

export async function buscarFechamentosIss(
  supabase: Supa,
  competencia: string,
  companyIds: string[],
): Promise<Map<string, FechamentoIss>> {
  const mapa = new Map<string, FechamentoIss>();
  if (companyIds.length === 0) return mapa;
  const { data, error } = await supabase
    .from("iss_fechamentos")
    .select("company_id, competencia, origem, valor_guia, observacao, marcado_em")
    .eq("competencia", competencia)
    .in("company_id", companyIds);
  // Tabela ainda não criada (migração não aplicada) — tela segue sem a coluna.
  if (error) return mapa;
  for (const r of data ?? []) {
    mapa.set(r.company_id as string, {
      companyId: r.company_id as string,
      competencia: r.competencia as string,
      origem: r.origem as OrigemFechamentoIss,
      valorGuia: r.valor_guia == null ? null : Number(r.valor_guia),
      observacao: (r.observacao as string | null) ?? null,
      marcadoEm: r.marcado_em as string,
    });
  }
  return mapa;
}
