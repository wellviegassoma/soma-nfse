import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, fromBytea } from "@/lib/certificate";

// Certificado da SOMA Contabilidade Integrada usado como procuradora dos
// clientes — na Central FGTS (Infosimples, `representado`) e na busca de
// notas do ADN quando a empresa não tem certificado próprio válido
// (`cnpjConsulta`/`cpfConsulta`, TipoConsulta "Procuracao"). Só funciona
// pra cliente com procuração eletrônica pra SOMA; sem ela o ADN responde
// E2245. Sobrescrevível por env caso o certificado mude de empresa.
export const CNPJ_PROCURADOR_PADRAO = "43852255000195";

export function cnpjProcurador(): string {
  return process.env.FGTS_CNPJ_PROCURADOR || CNPJ_PROCURADOR_PADRAO;
}

export async function certificadoProcurador(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
): Promise<{ pfxBase64: string; senha: string }> {
  const cnpj = cnpjProcurador();
  const { data: company } = await admin
    .from("companies")
    .select("certificates(encrypted_file, encrypted_password, expires_at)")
    .eq("cnpj", cnpj)
    .limit(1)
    .maybeSingle();

  const certs = company?.certificates as
    | { encrypted_file: string; encrypted_password: string; expires_at: string }
    | { encrypted_file: string; encrypted_password: string; expires_at: string }[]
    | null
    | undefined;
  const cert = Array.isArray(certs) ? certs[0] : certs;
  if (!cert) throw new Error(`Certificado da SOMA (CNPJ ${cnpj}) não está cadastrado no sistema.`);
  if (new Date(cert.expires_at).getTime() < Date.now()) {
    throw new Error("Certificado digital da SOMA está vencido.");
  }
  return {
    pfxBase64: decryptSecret(fromBytea(cert.encrypted_file)).toString("base64"),
    senha: decryptSecret(fromBytea(cert.encrypted_password)).toString("utf8"),
  };
}
