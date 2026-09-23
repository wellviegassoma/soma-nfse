import { NextResponse } from "next/server";
import { requireAtendimentoAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export async function POST(
  _request: Request,
  props: { params: Promise<{ ticketId: string }> },
) {
  await requireAtendimentoAccess();
  const { ticketId } = await props.params;

  const supabase = await createClient();
  const { error } = await supabase
    .from("atendimento_tickets")
    .update({ status: "FECHADO", fechado_em: new Date().toISOString() })
    .eq("id", ticketId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({ action: "atendimento.fechar", entity: "atendimento_tickets", entityId: ticketId });

  return NextResponse.json({ ok: true });
}
