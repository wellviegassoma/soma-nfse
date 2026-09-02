import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";

// Gera o DANFSe (PDF) de uma nota já sincronizada, sob demanda — mesma
// chamada ao backend que a exportação em lote já usa
// (lib/fechamento-export.ts), só que pra uma nota só e sem passar por
// ZIP. O XML já está salvo em notas_distribuidas.xml (guardado na
// sincronização), então isso nunca toca em servidor do governo de novo.
export async function GET(
  _request: Request,
  props: { params: Promise<{ companyId: string; notaId: string }> },
) {
  await requireSomaStaff();
  const { companyId, notaId } = await props.params;

  const supabase = await createClient();
  const { data: nota } = await supabase
    .from("notas_distribuidas")
    .select("xml, cancelada, numero, chave_acesso")
    .eq("id", notaId)
    .eq("company_id", companyId)
    .single();
  if (!nota) {
    return NextResponse.json({ error: "Nota não encontrada." }, { status: 404 });
  }

  let response: Response;
  try {
    response = await fetch(`${process.env.NFSE_ENGINE_URL}/notas/danfse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": process.env.NFSE_ENGINE_INTERNAL_TOKEN ?? "",
      },
      body: JSON.stringify({ xml_nfse: nota.xml, cancelada: nota.cancelada }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível gerar o PDF agora. Tente novamente em instantes." },
      { status: 502 },
    );
  }

  if (!response.ok) {
    return NextResponse.json({ error: "Não foi possível gerar o PDF dessa nota." }, { status: 502 });
  }

  const pdfBytes = await response.arrayBuffer();
  const nome = nota.numero || nota.chave_acesso || notaId;
  return new NextResponse(pdfBytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="nota-${nome}.pdf"`,
    },
  });
}
