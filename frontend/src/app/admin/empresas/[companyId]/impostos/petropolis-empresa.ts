import "server-only";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { decryptSecret, fromBytea } from "@/lib/certificate";

// Código IBGE do município de Petrópolis-RJ.
const IBGE_PETROPOLIS = "3303906";

export type EmpresaPetropolis =
  | { ok: true; cnpj: string; loginProprio: { login: string; senhaMd5: string } | null }
  | { ok: false; erro: string; status: number };

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

  // Empresa com login próprio no site da Prefeitura entra direto, sem
  // precisar escolher a empresa numa lista (isso só existe no login
  // único do escritório, que enxerga todos os clientes) — evita
  // depender da busca por CNPJ desse site, que não filtra de verdade.
  const { data: credencial } = await supabase
    .from("petropolis_credenciais")
    .select("login, encrypted_senha")
    .eq("company_id", companyId)
    .maybeSingle();

  let loginProprio: { login: string; senhaMd5: string } | null = null;
  if (credencial) {
    const senha = decryptSecret(fromBytea(credencial.encrypted_senha)).toString("utf8");
    const senhaMd5 = crypto.createHash("md5").update(senha, "utf8").digest("hex");
    loginProprio = { login: credencial.login, senhaMd5 };
  }

  return { ok: true, cnpj: company.cnpj, loginProprio };
}
