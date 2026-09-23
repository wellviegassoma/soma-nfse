import { NextResponse } from "next/server";
import { requireAtendimentoAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  await requireAtendimentoAccess();
  const { nome, departamento_padrao_id: departamentoPadraoId } = await request.json();

  if (!nome || typeof nome !== "string" || !departamentoPadraoId) {
    return NextResponse.json({ error: "Informe nome e departamento padrão." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("atendimento_conexoes")
    .insert({ nome: nome.trim(), departamento_padrao_id: departamentoPadraoId, tipo: "BAILEYS" })
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}
