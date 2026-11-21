import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { createClient } from "@/lib/supabase/server";
import { requireLegalizacaoAccess } from "@/lib/auth";

export async function GET(
  _request: Request,
  props: { params: Promise<{ documentoId: string }> },
) {
  await requireLegalizacaoAccess();
  const { documentoId } = await props.params;

  const supabase = await createClient();
  // Licença vigente ou uma versão anterior (histórico de renovações).
  const { data: vigente } = await supabase
    .from("legalizacao_documentos")
    .select("blob_pathname, nome_arquivo")
    .eq("id", documentoId)
    .maybeSingle();
  const documento =
    vigente ??
    (
      await supabase
        .from("legalizacao_documentos_historico")
        .select("blob_pathname, nome_arquivo")
        .eq("id", documentoId)
        .maybeSingle()
    ).data;

  if (!documento) {
    return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  }

  const blob = await get(documento.blob_pathname, { access: "private" });
  if (!blob || blob.statusCode !== 200) {
    return NextResponse.json({ error: "Arquivo não encontrado no Blob." }, { status: 404 });
  }

  return new NextResponse(blob.stream, {
    headers: {
      "Content-Type": blob.blob.contentType,
      "Content-Disposition": `attachment; filename="${documento.nome_arquivo}"`,
    },
  });
}
