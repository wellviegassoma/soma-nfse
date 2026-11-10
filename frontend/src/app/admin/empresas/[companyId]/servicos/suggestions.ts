import type { SupabaseClient } from "@supabase/supabase-js";

export type ServiceFormContext = {
  municipioIbge: string | null;
  municipioNome: string | null;
  taxRegime: string | null;
};

/**
 * Dados da empresa que o formulário de serviço usa pra sugerir valores:
 * município (código municipal aceito por outras notas da mesma
 * prefeitura) e regime (CST de PIS/COFINS).
 */
export async function fetchServiceFormContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  companyId: string,
): Promise<ServiceFormContext> {
  const { data } = await supabase
    .from("companies")
    .select("municipality_ibge_code, municipality_name, tax_regime")
    .eq("id", companyId)
    .maybeSingle();
  return {
    municipioIbge: data?.municipality_ibge_code ?? null,
    municipioNome: data?.municipality_name ?? null,
    taxRegime: data?.tax_regime ?? null,
  };
}
