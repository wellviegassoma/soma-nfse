import "server-only";

// Qual analista de IA cuida do fiscal de cada empresa (Serena = Simples,
// Newton = Lucro Presumido), pelas mesmas carteiras das telas — exceções,
// filiais e municípios inclusos.
import type { SupabaseClient } from "@supabase/supabase-js";
import { carteiraSerena } from "@/lib/serena";
import { carteiraNewton } from "@/lib/newton";

export type AnalistaIa = "SERENA" | "NEWTON";

export async function analistaPorEmpresa(db: SupabaseClient): Promise<Map<string, AnalistaIa>> {
  const [serena, newton] = await Promise.all([carteiraSerena(db), carteiraNewton(db)]);
  const mapa = new Map<string, AnalistaIa>();
  for (const e of serena) mapa.set(e.id, "SERENA");
  for (const e of newton) mapa.set(e.id, "NEWTON");
  return mapa;
}

export async function analistaDaEmpresa(db: SupabaseClient, companyId: string): Promise<AnalistaIa | null> {
  return (await analistaPorEmpresa(db)).get(companyId) ?? null;
}
