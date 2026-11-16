import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, fromBytea } from "@/lib/certificate";
import { certificadoProcurador } from "@/lib/certificado-procurador";

// Certificado pra emitir/cancelar NFS-e de uma empresa.
//
// 1. Certificado próprio válido → usa ele (como sempre foi).
// 2. Sem certificado próprio válido → certificado da SOMA como procuradora.
//    A Sefin Nacional aceita desde 01/11/2026: o certificado do procurador
//    conecta na API e assina a DPS; o prestador da nota continua sendo a
//    empresa. Exige procuração eletrônica (Receita) da empresa pra SOMA com
//    o serviço NFS-e, já confirmada pela SOMA. Por enquanto a Receita só
//    liberou pra Simples Nacional/MEI — os outros regimes seguem precisando
//    do certificado da própria empresa.

export type CertificadoEmissao = { pfxBase64: string; senha: string; viaProcuracao: boolean };

export const AVISO_PROCURACAO =
  "A nota foi enviada com o certificado da SOMA, por procuração. Se o governo recusou por permissão, confira se a empresa tem procuração eletrônica para a SOMA (CNPJ 43.852.255/0001-95) com o serviço NFS-e, e se a SOMA já confirmou essa procuração.";

export async function carregarCertificadoEmissao(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  companyId: string,
  taxRegime: string | null | undefined,
): Promise<CertificadoEmissao | { error: string }> {
  const { data: certificate } = await admin
    .from("certificates")
    .select("encrypted_file, encrypted_password, expires_at")
    .eq("company_id", companyId)
    .maybeSingle();

  const valido = !!certificate && new Date(certificate.expires_at).getTime() >= Date.now();
  if (valido) {
    try {
      return {
        pfxBase64: decryptSecret(fromBytea(certificate.encrypted_file)).toString("base64"),
        senha: decryptSecret(fromBytea(certificate.encrypted_password)).toString("utf8"),
        viaProcuracao: false,
      };
    } catch {
      return { error: "Não foi possível preparar o certificado para assinatura." };
    }
  }

  if (taxRegime !== "SIMPLES_NACIONAL") {
    return {
      error: certificate
        ? "O certificado digital dessa empresa está vencido. Por procuração, a Receita só libera a emissão para Simples Nacional/MEI — renove o certificado."
        : "Essa empresa não tem certificado digital. Por procuração, a Receita só libera a emissão para Simples Nacional/MEI — cadastre o certificado da empresa.",
    };
  }

  try {
    const soma = await certificadoProcurador(admin);
    return { ...soma, viaProcuracao: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Certificado da SOMA indisponível." };
  }
}
