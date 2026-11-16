import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { createClient } from "@/lib/supabase/server";
import { autorizarApi } from "@/lib/auth";

// Anexo de um pedido de nota (foto, PDF, áudio, planilha do cliente), do Blob
// privado. Mesmo padrão de /api/atendimento/midia: só quem pode emitir nota
// vê; RLS de pedidos_nota restringe a staff/analista.
export async function GET(
  _request: Request,
  props: { params: Promise<{ pedidoId: string; indice: string }> },
) {
  const { pedidoId, indice } = await props.params;
  const supabase = await createClient();
  const { data: pedido } = await supabase.from("pedidos_nota").select("company_id, anexos").eq("id", pedidoId).maybeSingle();
  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });

  const naoAutorizado = await autorizarApi("notas.emitir", (pedido.company_id as string | null) ?? undefined);
  if (naoAutorizado) return naoAutorizado;

  const anexo = ((pedido.anexos ?? []) as { pathname: string; mimetype: string | null; nome: string | null }[])[Number(indice)];
  if (!anexo) return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });

  const blob = await get(anexo.pathname, { access: "private" });
  if (!blob || blob.statusCode !== 200) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });

  return new NextResponse(blob.stream, {
    headers: {
      "Content-Type": anexo.mimetype || blob.blob.contentType,
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
    },
  });
}
