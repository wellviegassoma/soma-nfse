import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { autorizarApi } from "@/lib/auth";
import { decryptSecret, fromBytea } from "@/lib/certificate";
import { salvarPagamentoIss, type PagamentoIss } from "@/lib/iss-pagamentos";

// Login + duas leituras da grade (Pendentes e Quitadas) num Chromium.
export const maxDuration = 300;

// SÓ LEITURA: a guia de ISS da competência foi paga no Nota Carioca?
export async function GET(request: Request, props: { params: Promise<{ companyId: string }> }) {
  const naoAutorizado = await autorizarApi("impostos.ver");
  if (naoAutorizado) return naoAutorizado;
  const { companyId } = await props.params;
  const competencia = new URL(request.url).searchParams.get("competencia") ?? "";
  if (!/^\d{4}-\d{2}$/.test(competencia)) return NextResponse.json({ error: "Competência inválida." }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: company } = await supabase
    .from("companies")
    .select("cnpj, certificates(encrypted_file, encrypted_password, expires_at)")
    .eq("id", companyId)
    .single();
  if (!company) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  const certificado = Array.isArray(company.certificates) ? company.certificates[0] : company.certificates;
  if (!certificado) return NextResponse.json({ error: "Sem certificado digital cadastrado." }, { status: 400 });
  if (new Date(certificado.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Certificado digital vencido." }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch(`${process.env.NOTA_CARIOCA_SERVICE_URL}/pagamento-iss`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Token": process.env.NOTA_CARIOCA_INTERNAL_TOKEN ?? "" },
      body: JSON.stringify({
        certificado: {
          pfx_base64: decryptSecret(fromBytea(certificado.encrypted_file)).toString("base64"),
          senha: decryptSecret(fromBytea(certificado.encrypted_password)).toString("utf8"),
        },
        competencia,
        filial: company.cnpj ? company.cnpj.replace(/\D/g, "").slice(8, 12) !== "0001" : null,
      }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Não foi possível acessar o Nota Carioca agora." }, { status: 502 });
  }
  const corpo = await response.json().catch(() => null);
  if (!response.ok) {
    const mensagem = (corpo && typeof corpo.detail === "string" && corpo.detail) || `Serviço do Nota Carioca respondeu HTTP ${response.status}.`;
    return NextResponse.json({ error: mensagem }, { status: 502 });
  }

  const resultado: PagamentoIss = {
    status: corpo.status,
    pagas: (corpo.pagas ?? []).map((p: Record<string, unknown>) => ({
      valor: p.valor ?? null,
      quitada_em: p.quitada_em ?? null,
      validade: p.validade ?? null,
      documento: p.documento ?? null,
      origem: p.origem ?? null,
    })),
    abertas: (corpo.abertas ?? []).map((p: Record<string, unknown>) => ({
      valor: p.valor ?? null,
      validade: p.validade ?? null,
      documento: p.documento ?? null,
      origem: p.origem ?? null,
    })),
    mensagem: null,
    verificadoEm: new Date().toISOString(),
  };
  await salvarPagamentoIss(supabase, { companyId, competencia, municipio: "rio", resultado, userId: user?.id ?? null });
  return NextResponse.json(resultado);
}
