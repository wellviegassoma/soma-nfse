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
    return NextResponse.json({ error: "XML não encontrado." }, { status: 404 });
  }

  return new NextResponse(nfse.xml_nfse, {
    headers: {
      "Content-Type": "application/xml",
      "Content-Disposition": `attachment; filename="nfse-${dpsId}.xml"`,
    },
  });
}
