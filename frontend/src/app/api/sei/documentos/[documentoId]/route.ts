import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { autorizarApi } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Abre um documento do SEI guardado no Blob. ?download=1 baixa; sem ele abre
// no navegador. O HTML vem do SEI (conteúdo de terceiro), então vai com CSP
// sandbox: sem script, sem acesso à sessão do SOMA.
export async function GET(request: Request, props: { params: Promise<{ documentoId: string }> }) {
  const negado = await autorizarApi("legalizacao.ver");
  if (negado) return negado;
  const { documentoId } = await props.params;

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("sei_documentos")
    .select("blob_pathname, nome_arquivo, mime")
    .eq("id", documentoId)
    .maybeSingle();
  if (!doc?.blob_pathname) {
    return NextResponse.json({ error: "Documento ainda não baixado do SEI." }, { status: 404 });
  }

  const blob = await get(doc.blob_pathname, { access: "private" });
  if (!blob || blob.statusCode !== 200) {
    return NextResponse.json({ error: "Arquivo não encontrado no Blob." }, { status: 404 });
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  const nome = (doc.nome_arquivo ?? "documento").replace(/["\\\r\n]/g, "_");
  const mime =
    (doc.mime || blob.blob.contentType)
      .split(";")
      .map((p: string) => p.trim())
      .filter(Boolean)
      .join("; ") || "application/octet-stream";
  const headers: Record<string, string> = {
    "Content-Type": mime,
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${nome.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=3600",
  };
  // Só no HTML: sandbox quebraria o visualizador de PDF do navegador.
  if (/html/i.test(mime)) {
    headers["Content-Security-Policy"] = "sandbox; default-src 'none'; img-src data: https:; style-src 'unsafe-inline'";
  }
  return new NextResponse(blob.stream, { headers });
}
