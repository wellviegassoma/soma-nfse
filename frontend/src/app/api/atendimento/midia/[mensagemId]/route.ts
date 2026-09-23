import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { createClient } from "@/lib/supabase/server";
import { requireAtendimentoAccess } from "@/lib/auth";

// Mesmo padrão de /api/legalizacao/documentos/[documentoId]: blob privado,
// só quem tem acesso ao módulo consegue buscar — a URL do Blob em si não
// abre pra qualquer um com o link.
export async function GET(
  _request: Request,
  props: { params: Promise<{ mensagemId: string }> },
) {
  await requireAtendimentoAccess();
  const { mensagemId } = await props.params;

  const supabase = await createClient();
  const { data: mensagem } = await supabase
    .from("atendimento_mensagens")
    .select("midia_pathname")
    .eq("id", mensagemId)
    .maybeSingle();

  if (!mensagem?.midia_pathname) {
    return NextResponse.json({ error: "Mídia não encontrada." }, { status: 404 });
  }

  const blob = await get(mensagem.midia_pathname, { access: "private" });
  if (!blob || blob.statusCode !== 200) {
    return NextResponse.json({ error: "Arquivo não encontrado no Blob." }, { status: 404 });
  }

  return new NextResponse(blob.stream, {
    headers: { "Content-Type": blob.blob.contentType, "Content-Disposition": "inline" },
  });
}
