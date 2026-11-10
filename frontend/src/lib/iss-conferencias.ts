import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotaFaturamento } from "@/lib/faturamento";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type MunicipioConferenciaIss = "rio" | "petropolis";

// O que a central recebe do servidor sobre a última conferência salva.
// `dados` é o resultado da conferência no formato de cada central
// (sem o PDF) — a própria central sabe ler o seu.
export type ConferenciaIssSalva = {
  status: string;
  mensagem: string | null;
  dados: Record<string, unknown>;
  conferidoEm: string;
  conferidoPor: string | null;
  // O faturamento/cadastro da SOMA mudou desde a conferência: precisa
  // reprocessar antes de emitir.
  desatualizada: boolean;
};

// "Retrato" do lado SOMA usado na conferência: quantidade de notas válidas,
// total, retido e o ISS calculado (pega mudança de cadastro do ISS
// também). Qualquer diferença aqui deixa a conferência desatualizada.
export function assinaturaFaturamentoIss(
  notas: NotaFaturamento[],
  competencia: string,
  issTipo: string | null | undefined,
  issSoma: number | null,
): string {
  const doMes = notas.filter((n) => !n.cancelada && n.competencia === competencia);
  const total = doMes.reduce((s, n) => s + n.valor, 0);
  const retido = doMes.filter((n) => n.issRetido).reduce((s, n) => s + n.valor, 0);
  return [doMes.length, total.toFixed(2), retido.toFixed(2), issTipo ?? "", issSoma == null ? "" : issSoma.toFixed(2)].join(
    "|",
  );
}

export async function buscarConferenciasIss(
  supabase: Supa,
  municipio: MunicipioConferenciaIss,
  competencia: string,
  assinaturas: Map<string, string>,
): Promise<Map<string, ConferenciaIssSalva>> {
  const mapa = new Map<string, ConferenciaIssSalva>();
  if (assinaturas.size === 0) return mapa;
  const { data, error } = await supabase
    .from("iss_conferencias")
    .select("company_id, status, mensagem, dados, assinatura_soma, conferido_em, autor:profiles(full_name)")
    .eq("competencia", competencia)
    .eq("municipio", municipio)
    .in("company_id", [...assinaturas.keys()]);
  // Tabela ainda não criada (migração não aplicada) — central segue como antes.
  if (error) return mapa;
  for (const r of data ?? []) {
    const autor = Array.isArray(r.autor) ? r.autor[0] : r.autor;
    mapa.set(r.company_id as string, {
      status: r.status as string,
      mensagem: (r.mensagem as string | null) ?? null,
      dados: (r.dados as Record<string, unknown>) ?? {},
      conferidoEm: r.conferido_em as string,
      conferidoPor: (autor as { full_name?: string | null } | null)?.full_name ?? null,
      desatualizada: r.assinatura_soma !== assinaturas.get(r.company_id as string),
    });
  }
  return mapa;
}
