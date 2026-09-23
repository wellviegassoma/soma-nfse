import { NextResponse } from "next/server";
import { requireAtendimentoAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Busca na agenda de contatos sincronizada pelo whatsapp-connector — usada
// pelo seletor de "Nova conversa". Exige pelo menos 2 caracteres pra não
// devolver a agenda inteira a cada tecla digitada.
export async function GET(request: Request) {
  await requireAtendimentoAccess();

  const url = new URL(request.url);
  const termo = (url.searchParams.get("q") || "").trim();
  if (termo.length < 2) {
    return NextResponse.json({ contatos: [] });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("atendimento_contatos_whatsapp")
    .select("jid, nome, telefone")
    .or(`nome.ilike.%${termo}%,telefone.ilike.%${termo}%`)
    .order("nome")
    .limit(20);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ contatos: data ?? [] });
}
