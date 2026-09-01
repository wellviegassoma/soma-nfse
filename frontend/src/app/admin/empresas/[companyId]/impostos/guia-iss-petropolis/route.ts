import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Código IBGE do município de Petrópolis-RJ.
const IBGE_PETROPOLIS = "3303906";

export const maxDuration = 60;

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
    .select("cnpj, municipality_ibge_code")
    .eq("id", companyId)
    .single();

  if (!company) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }
  if (company.municipality_ibge_code !== IBGE_PETROPOLIS) {
    return NextResponse.json(
      { error: "Guia de ISS de Petrópolis só está disponível para empresas do município." },
      { status: 400 },
    );
  }
  if (!company.cnpj) {
    return NextResponse.json({ error: "Empresa sem CNPJ cadastrado." }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch(`${process.env.NFSE_ENGINE_URL}/petropolis/guia-iss`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": process.env.NFSE_ENGINE_INTERNAL_TOKEN ?? "",
      },
      body: JSON.stringify({ cnpj: company.cnpj, competencia }),
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
