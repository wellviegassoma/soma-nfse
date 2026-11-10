import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PrefillEmissao = {
  /** Nota que está sendo repetida ("Emitir de novo"). */
  inicial?: { customerId: string; serviceId: string; amount: string; description: string };
  /** Tomadores mais usados nas últimas notas aceitas (até 6, do mais usado). */
  tomadoresFrequentes: string[];
  servicoMaisUsado?: string;
};

/**
 * Atalhos do formulário de emissão: repetir uma nota (?de=<dpsId>) e
 * sugerir os tomadores/serviço que a empresa mais usa. Olha só as últimas
 * 300 notas aceitas — o suficiente pra "mais usados" sem varrer tudo.
 */
export async function carregarPrefillEmissao(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  companyId: string,
  deDpsId?: string | string[],
): Promise<PrefillEmissao> {
  const de = typeof deDpsId === "string" && /^[0-9a-f-]{36}$/i.test(deDpsId) ? deDpsId : undefined;

  const [{ data: recentes }, origem] = await Promise.all([
    supabase
      .from("dps")
      .select("customer_id, service_id")
      .eq("company_id", companyId)
      .eq("status", "ACCEPTED")
      .order("created_at", { ascending: false })
      .limit(300),
    de
      ? supabase
          .from("dps")
          .select("customer_id, service_id, valor, descricao")
          .eq("id", de)
          .eq("company_id", companyId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const contar = (ids: string[]) => {
    const c = new Map<string, number>();
    for (const id of ids) c.set(id, (c.get(id) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  };
  const linhas = recentes ?? [];
  const o = origem.data as { customer_id: string; service_id: string; valor: number; descricao: string } | null;

  return {
    inicial: o
      ? {
          customerId: o.customer_id,
          serviceId: o.service_id,
          amount: String(o.valor).replace(".", ","),
          description: o.descricao,
        }
      : undefined,
    tomadoresFrequentes: contar(linhas.map((l) => l.customer_id)).slice(0, 6),
    servicoMaisUsado: contar(linhas.map((l) => l.service_id))[0],
  };
}
