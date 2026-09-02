import { NextResponse } from "next/server";
import { buscarEmpresaPetropolis } from "../petropolis-empresa";

// Consolidação de período + emissão da guia são ações reais (criam a
// declaração oficial no Petrópolis) — só chamado depois que o usuário
// confirma explicitamente, vendo o valor de serviços, na tela.
export const maxDuration = 90;

export async function POST(
  request: Request,
  props: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await props.params;
  const body = await request.json().catch(() => ({}));
  const competencia = typeof body.competencia === "string" ? body.competencia : null;
  if (competencia && !/^\d{4}-\d{2}$/.test(competencia)) {
    return NextResponse.json({ error: "Competência inválida." }, { status: 400 });
  }

  const empresa = await buscarEmpresaPetropolis(companyId);
  if (!empresa.ok) {
    return NextResponse.json({ error: empresa.erro }, { status: empresa.status });
  }

  let response: Response;
  try {
    response = await fetch(`${process.env.NFSE_ENGINE_URL}/petropolis/consolidar-e-emitir-guia`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": process.env.NFSE_ENGINE_INTERNAL_TOKEN ?? "",
      },
      body: JSON.stringify({ cnpj: empresa.cnpj, competencia }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Não foi possível acessar o ISS de Petrópolis agora." }, { status: 502 });
  }

  if (!response.ok) {
    const corpo = await response.json().catch(() => null);
    const mensagem =
      (corpo && typeof corpo.detail === "string" && corpo.detail) ||
      "Não foi possível consolidar e gerar a guia agora.";
    return NextResponse.json({ error: mensagem }, { status: 502 });
  }

  const pdfBytes = await response.arrayBuffer();
  return new NextResponse(pdfBytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="guia-iss-petropolis-${competencia ?? "atual"}.pdf"`,
      "X-Valor-Servicos": response.headers.get("X-Valor-Servicos") ?? "",
      "X-Valor-Iss": response.headers.get("X-Valor-Iss") ?? "",
    },
  });
}
