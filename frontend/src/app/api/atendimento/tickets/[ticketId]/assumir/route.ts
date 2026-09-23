import { NextResponse } from "next/server";
import { requireAtendimentoAccess, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// .eq("status", "FILA") na cláusula de update evita corrida: se dois
// atendentes clicarem "Assumir" ao mesmo tempo, só o primeiro update
// (que ainda encontra status FILA) tem efeito — o segundo não afeta
// nenhuma linha, silenciosamente. O router.refresh() do cliente então
// mostra o chamado já como ABERTO com o outro atendente.
export async function POST(
  _request: Request,
  props: { params: Promise<{ ticketId: string }> },
) {
  await requireAtendimentoAccess();
  const user = await requireUser();
  const { ticketId } = await props.params;

  const supabase = await createClient();
  const { error } = await supabase
    .from("atendimento_tickets")
    .update({ atendente_id: user.id, status: "ABERTO" })
    .eq("id", ticketId)
    .eq("status", "FILA");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
