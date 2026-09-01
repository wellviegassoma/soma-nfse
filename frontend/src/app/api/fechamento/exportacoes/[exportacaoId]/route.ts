import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { requireSomaStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  props: { params: Promise<{ exportacaoId: string }> },
) {
  await requireSomaStaff();
  const { exportacaoId } = await props.params;

  const supabase = await createClient();
  const { data: exportacao } = await supabase
    .from("exportacoes_fechamento")
    .select("competencia, status, blob_pathname")
    .eq("id", exportacaoId)
    .maybeSingle();

  if (!exportacao || exportacao.status !== "pronto" || !exportacao.blob_pathname) {
    return NextResponse.json({ error: "Exportação ainda não está pronta." }, { status: 404 });
  }

  const blob = await get(exportacao.blob_pathname, { access: "private" });
  if (!blob || blob.statusCode !== 200) {
    return NextResponse.json({ error: "Arquivo não encontrado no Blob." }, { status: 404 });
  }

  return new NextResponse(blob.stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="fechamento-${exportacao.competencia}.zip"`,
    },
  });
}
