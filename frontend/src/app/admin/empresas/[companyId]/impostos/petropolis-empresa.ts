import "server-only";
import { createClient } from "@/lib/supabase/server";

// Código IBGE do município de Petrópolis-RJ.
const IBGE_PETROPOLIS = "3303906";

export type EmpresaPetropolis = { ok: true; cnpj: string } | { ok: false; erro: string; status: number };

export async function buscarEmpresaPetropolis(companyId: string): Promise<EmpresaPetropolis> {
  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("cnpj, municipality_ibge_code")
    .eq("id", companyId)
    .single();

  if (!company) {
    return { ok: false, erro: "Empresa não encontrada.", status: 404 };
  }
  if (company.municipality_ibge_code !== IBGE_PETROPOLIS) {
    return {
      ok: false,
      erro: "Guia de ISS de Petrópolis só está disponível para empresas do município.",
      status: 400,
    };
  }
  if (!company.cnpj) {
    return { ok: false, erro: "Empresa sem CNPJ cadastrado.", status: 400 };
  }
  return { ok: true, cnpj: company.cnpj };
}
