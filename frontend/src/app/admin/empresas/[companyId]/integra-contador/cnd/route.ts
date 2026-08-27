import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";

export async function GET(
  _request: Request,
  props: { params: Promise<{ companyId: string }> },
) {
  await requireSomaStaff();
  const { companyId } = await props.params;

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("cnpj")
    .eq("id", companyId)
    .single();

  if (!company?.cnpj) {
    return NextResponse.json(
      { error: "Essa empresa não tem CNPJ cadastrado — a CND só consulta CNPJ." },
      { status: 400 },
    );
  }

  let response: Response;
  try {
    response = await fetch(
      `${process.env.INTEGRA_CONTADOR_URL}/contribuintes/${company.cnpj}/cnd?gerar_pdf=true`,
      {
        headers: { "X-Internal-Token": process.env.INTEGRA_CONTADOR_INTERNAL_TOKEN ?? "" },
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível consultar a CND agora. Tente novamente em instantes." },
      { status: 502 },
    );
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    return NextResponse.json(
      { error: body?.detail ?? "Não foi possível consultar a CND agora." },
      { status: 502 },
    );
  }

  const body = await response.json();
  const certidao = body.resposta?.Certidao;
  const pdfBase64: string | undefined = certidao?.DocumentoPdf;

  if (!pdfBase64) {
    // Status 3/4 (não emitida) não tem PDF — devolve a mensagem pra tela mostrar o motivo.
    return NextResponse.json({
      emitida: false,
      mensagem: body.resposta?.Mensagem ?? "Não foi possível emitir a certidão.",
    });
  }

  return new NextResponse(Buffer.from(pdfBase64, "base64"), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="cnd-${company.cnpj}.pdf"`,
    },
  });
}
