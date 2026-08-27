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
      { error: "Essa empresa não tem CNPJ cadastrado — o Integra Contador só consulta CNPJ." },
      { status: 400 },
    );
  }

  let response: Response;
  try {
    response = await fetch(
      `${process.env.INTEGRA_CONTADOR_URL}/contribuintes/${company.cnpj}/situacao-fiscal`,
      {
        headers: { "X-Internal-Token": process.env.INTEGRA_CONTADOR_INTERNAL_TOKEN ?? "" },
        cache: "no-store",
        // O Sitfis pode demorar até ~1min na primeira consulta do dia
        // (fluxo de espera assíncrona do lado da Serpro) — chamadas
        // seguintes vêm do cache do integra-contador e voltam na hora.
        signal: AbortSignal.timeout(90_000),
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível consultar a situação fiscal agora. Tente novamente em instantes." },
      { status: 502 },
    );
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    return NextResponse.json(
      { error: body?.detail ?? "Não foi possível consultar a situação fiscal agora." },
      { status: 502 },
    );
  }

  const body = await response.json();
  const dados = JSON.parse(body.resposta.dados);
  const pdfBase64: string | undefined = dados.pdf;
  if (!pdfBase64) {
    return NextResponse.json(
      { error: "A Serpro não devolveu o PDF do relatório." },
      { status: 502 },
    );
  }

  return new NextResponse(Buffer.from(pdfBase64, "base64"), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="situacao-fiscal-${company.cnpj}.pdf"`,
    },
  });
}
