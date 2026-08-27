import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { createClient } from "@/lib/supabase/server";
import { requireExtratosAccess } from "@/lib/auth";

export async function GET(
  _request: Request,
  props: { params: Promise<{ extratoId: string }> },
) {
  await requireExtratosAccess();
  const { extratoId } = await props.params;

  const supabase = await createClient();
  const { data: extrato } = await supabase
    .from("extratos_mensais")
    .select("blob_pathname, nome_arquivo")
    .eq("id", extratoId)
    .maybeSingle();

  if (!extrato?.blob_pathname) {
    return NextResponse.json({ error: "Extrato não encontrado." }, { status: 404 });
  }

  const blob = await get(extrato.blob_pathname, { access: "private" });
  if (!blob || blob.statusCode !== 200) {
    return NextResponse.json({ error: "Arquivo não encontrado no Blob." }, { status: 404 });
  }

  return new NextResponse(blob.stream, {
    headers: {
      "Content-Type": blob.blob.contentType,
      "Content-Disposition": `attachment; filename="${extrato.nome_arquivo ?? "extrato"}"`,
    },
  });
}
