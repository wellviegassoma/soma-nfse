import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  props: { params: Promise<{ companyId: string; dpsId: string }> },
) {
  const { dpsId } = await props.params;
  const supabase = await createClient();

  const { data: nfse } = await supabase
    .from("nfse")
    .select("xml_nfse")
    .eq("dps_id", dpsId)
    .maybeSingle();

  if (!nfse?.xml_nfse) {
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
      body: JSON.stringify({ xml_nfse: nfse.xml_nfse }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível gerar o PDF agora." },
      { status: 502 },
    );
  }

  if (!response.ok) {
    return NextResponse.json(
      { error: "Não foi possível gerar o PDF agora." },
      { status: 502 },
    );
  }

  const pdfBytes = await response.arrayBuffer();
  return new NextResponse(pdfBytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="danfse-${dpsId}.pdf"`,
    },
  });
}
