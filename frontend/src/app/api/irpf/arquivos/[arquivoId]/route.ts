import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";

export async function GET(_request: Request, props: { params: Promise<{ arquivoId: string }> }) {
  await requireSomaStaff();
  const { arquivoId } = await props.params;
  const supabase = await createClient();
  const { data: arquivo } = await supabase
    .from("irpf_arquivos")
    .select("blob_pathname, nome_arquivo")
    .eq("id", arquivoId)
    .maybeSingle();
  if (!arquivo) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });

  const blob = await get(arquivo.blob_pathname, { access: "private" });
  if (!blob || blob.statusCode !== 200) {
    return NextResponse.json({ error: "Arquivo não encontrado no Blob." }, { status: 404 });
  }
  const nome = arquivo.nome_arquivo.replace(/["\r\n]/g, "");
  return new NextResponse(blob.stream, {
    headers: {
      "Content-Type": blob.blob.contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
