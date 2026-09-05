import { NextResponse } from "next/server";
import { buscarEmpresaPetropolis } from "../petropolis-empresa";

export const maxDuration = 90;

export async function GET(
  request: Request,
  props: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await props.params;
  const competencia = new URL(request.url).searchParams.get("competencia");
  if (competencia && !/^\d{4}-\d{2}$/.test(competencia)) {
    return NextResponse.json({ error: "Competência inválida." }, { status: 400 });
  }

  const empresa = await buscarEmpresaPetropolis(companyId);
  if (!empresa.ok) {
    return NextResponse.json({ error: empresa.erro }, { status: empresa.status });
  }

  let response: Response;
  try {
    response = await fetch(`${process.env.NFSE_ENGINE_URL}/petropolis/guia-iss`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": process.env.NFSE_ENGINE_INTERNAL_TOKEN ?? "",
      },
      body: JSON.stringify({
        cnpj: empresa.cnpj,
        competencia,
        login: empresa.loginProprio?.login,
        senha_md5: empresa.loginProprio?.senhaMd5,
      }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Não foi possível acessar o ISS de Petrópolis agora." }, { status: 502 });
  }

  if (!response.ok) {
    const corpo = await response.json().catch(() => null);
    const mensagem =
      (corpo && typeof corpo.detail === "string" && corpo.detail) ||
      "Não foi possível buscar a guia de ISS agora.";
    return NextResponse.json({ error: mensagem }, { status: 502 });
  }

  // 200 com corpo JSON = período ainda não consolidado (não é um erro,
  // é um estado — o frontend oferece consolidar e buscar de novo).
  if ((response.headers.get("content-type") ?? "").includes("application/json")) {
    const corpo = await response.json();
    return NextResponse.json(corpo);
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
