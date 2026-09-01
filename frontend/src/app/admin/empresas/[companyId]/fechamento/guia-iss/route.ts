import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptSecret, fromBytea } from "@/lib/certificate";
import { documentoEmpresa } from "@/lib/formatters";

// Código IBGE do município do Rio de Janeiro — o Nota Carioca só existe
// pra empresas estabelecidas nessa cidade.
const IBGE_RIO_DE_JANEIRO = "3304557";

export async function GET(
  request: Request,
  props: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await props.params;
  const competencia = new URL(request.url).searchParams.get("competencia");
  if (competencia && !/^\d{4}-\d{2}$/.test(competencia)) {
    return NextResponse.json({ error: "Competência inválida." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select(
      "cnpj, cpf, municipality_ibge_code, certificates(encrypted_file, encrypted_password, expires_at)",
    )
    .eq("id", companyId)
    .single();

  if (!company) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }
  if (company.municipality_ibge_code !== IBGE_RIO_DE_JANEIRO) {
    return NextResponse.json(
      { error: "Guia de ISS via Nota Carioca só está disponível para empresas do Rio de Janeiro." },
      { status: 400 },
    );
  }

  const certificado = Array.isArray(company.certificates)
    ? company.certificates[0]
    : company.certificates;
  if (!certificado) {
    return NextResponse.json({ error: "Empresa sem certificado digital cadastrado." }, { status: 400 });
  }
  if (new Date(certificado.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Certificado digital vencido." }, { status: 400 });
  }
  if (!documentoEmpresa(company)) {
    return NextResponse.json({ error: "Empresa sem CNPJ/CPF cadastrado." }, { status: 400 });
  }

  const pfxBase64 = decryptSecret(fromBytea(certificado.encrypted_file)).toString("base64");
  const senha = decryptSecret(fromBytea(certificado.encrypted_password)).toString("utf8");

  let response: Response;
  try {
    response = await fetch(`${process.env.NFSE_ENGINE_URL}/nota-carioca/guia-iss`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": process.env.NFSE_ENGINE_INTERNAL_TOKEN ?? "",
      },
      body: JSON.stringify({
        certificado: { pfx_base64: pfxBase64, senha },
        competencia,
      }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Não foi possível acessar o Nota Carioca agora." }, { status: 502 });
  }

  if (!response.ok) {
    const corpo = await response.json().catch(() => null);
    const mensagem =
      (corpo && typeof corpo.detail === "string" && corpo.detail) ||
      "Não foi possível buscar a guia de ISS agora.";
    return NextResponse.json({ error: mensagem }, { status: 502 });
  }

  const pdfBytes = await response.arrayBuffer();
  return new NextResponse(pdfBytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="guia-iss-${competencia ?? "atual"}.pdf"`,
    },
  });
}
