import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { createClient } from "@/lib/supabase/server";
import { requireComercialAccess } from "@/lib/auth";

export async function GET(
  _request: Request,
  props: { params: Promise<{ anexoId: string }> },
) {
  await requireComercialAccess();
  const { anexoId } = await props.params;

  const supabase = await createClient();
  const { data: anexo } = await supabase
    .from("comercial_prospect_anexos")
    .select("blob_pathname, nome_arquivo")
    .eq("id", anexoId)
    .maybeSingle();

  if (!anexo) {
    return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });
  }

  const blob = await get(anexo.blob_pathname, { access: "private" });
  if (!blob || blob.statusCode !== 200) {
    return NextResponse.json({ error: "Arquivo não encontrado no Blob." }, { status: 404 });
  }

  return new NextResponse(blob.stream, {
    headers: {
      "Content-Type": blob.blob.contentType,
      "Content-Disposition": `attachment; filename="${anexo.nome_arquivo}"`,
    },
  });
}
