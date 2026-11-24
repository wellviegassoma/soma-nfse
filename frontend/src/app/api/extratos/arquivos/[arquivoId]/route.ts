import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { createClient } from "@/lib/supabase/server";
import { requireExtratosAccess } from "@/lib/auth";

// Download de um arquivo de extrato (extrato_arquivos). ?ver=1 abre no navegador.
export async function GET(request: Request, props: { params: Promise<{ arquivoId: string }> }) {
  await requireExtratosAccess();
  const { arquivoId } = await props.params;
  const db = await createClient();
  const { data: arq } = await db.from("extrato_arquivos").select("blob_pathname, nome_arquivo").eq("id", arquivoId).maybeSingle();
  if (!arq?.blob_pathname) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  const blob = await get(arq.blob_pathname, { access: "private" });
  if (!blob || blob.statusCode !== 200) return NextResponse.json({ error: "Arquivo não encontrado no Blob." }, { status: 404 });
  const ver = new URL(request.url).searchParams.get("ver") === "1";
  const nome = encodeURIComponent(arq.nome_arquivo ?? "extrato");
  return new NextResponse(blob.stream, {
    headers: {
      "Content-Type": blob.blob.contentType,
      "Content-Disposition": `${ver ? "inline" : "attachment"}; filename*=UTF-8''${nome}`,
    },
  });
}
