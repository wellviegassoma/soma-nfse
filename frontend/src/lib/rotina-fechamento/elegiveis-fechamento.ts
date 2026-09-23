import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type EmpresaElegivel = { id: string; nome: string };

// Etapa 6 — quem já pode fechar a competência antes do resto: Simples
// Nacional, Anexo III fixo (não sujeito ao Fator R, ver
// company.sujeito_fator_r em admin/fechamento/simples/page.tsx linhas
// 79-95 — mesmo campo já usado pra calcular o DAS real, não um critério
// à parte) e que ainda não tem linha em fechamentos_mensais pra essa
// competência (senão reapareceria como "elegível" toda vez).
export async function listarElegiveisFechamentoAntecipado(
  supabase: Supa,
  competencia: string,
): Promise<EmpresaElegivel[]> {
  const { data: companies, error } = await supabase
    .from("companies")
    .select("id, legal_name, trade_name")
    .eq("tax_regime", "SIMPLES_NACIONAL")
    .eq("ativa", true)
    .eq("sujeito_fator_r", false)
    .not("cnpj", "is", null);
  if (error) throw error;
  if (!companies || companies.length === 0) return [];

  const { data: jaFechadas, error: erroFechadas } = await supabase
    .from("fechamentos_mensais")
    .select("company_id")
    .eq("competencia", competencia)
    .in(
      "company_id",
      companies.map((c) => c.id),
    );
  if (erroFechadas) throw erroFechadas;
  const fechadasSet = new Set((jaFechadas ?? []).map((f) => f.company_id));

  return companies
    .filter((c) => !fechadasSet.has(c.id))
    .map((c) => ({ id: c.id, nome: c.trade_name || c.legal_name }));
}
