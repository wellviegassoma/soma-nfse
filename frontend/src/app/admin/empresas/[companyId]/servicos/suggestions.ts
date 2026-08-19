import type { SupabaseClient } from "@supabase/supabase-js";

export type ServiceCodeSuggestions = {
  nationalTaxCodes: string[];
  nbsCodes: string[];
};

/**
 * Sugestões de autocomplete pros campos "Código tributário nacional" e
 * "NBS" — não temos a tabela oficial do governo carregada no sistema, só
 * o que a própria SOMA já cadastrou em outros serviços (cresce
 * organicamente, sem depender de uma planilha externa).
 */
export async function fetchServiceCodeSuggestions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
): Promise<ServiceCodeSuggestions> {
  const { data } = await supabase.from("services").select("national_tax_code, nbs");

  const nationalTaxCodes = new Set<string>();
  const nbsCodes = new Set<string>();
  for (const row of data ?? []) {
    if (row.national_tax_code) nationalTaxCodes.add(row.national_tax_code);
    if (row.nbs) nbsCodes.add(row.nbs);
  }

  return {
    nationalTaxCodes: [...nationalTaxCodes].sort(),
    nbsCodes: [...nbsCodes].sort(),
  };
}
