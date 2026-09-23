import { NextResponse } from "next/server";
import { requireAtendimentoAccess, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

// Comentário obrigatório de propósito — achado real navegando o Digisac:
// é o único jeito de quem recebe o chamado saber o contexto sem reler a
// conversa inteira (ver comment da tabela atendimento_transferencias).
export async function POST(
  request: Request,
  props: { params: Promise<{ ticketId: string }> },
) {
  await requireAtendimentoAccess();
  const user = await requireUser();
  const { ticketId } = await props.params;
  const {
    departamento_id: departamentoId,
    comentario,
    atendente_id: atendenteId,
  } = await request.json();

  if (!departamentoId || typeof comentario !== "string" || !comentario.trim()) {
    return NextResponse.json(
      { error: "Informe o departamento de destino e um comentário." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: ticketAtual, error: erroAtual } = await supabase
    .from("atendimento_tickets")
    .select("departamento_id, atendente_id")
    .eq("id", ticketId)
    .single();
  if (erroAtual || !ticketAtual) {
    return NextResponse.json({ error: "Chamado não encontrado." }, { status: 404 });
  }

  const { error: erroTransferencia } = await supabase.from("atendimento_transferencias").insert({
    ticket_id: ticketId,
    de_departamento_id: ticketAtual.departamento_id,
    para_departamento_id: departamentoId,
    de_atendente_id: ticketAtual.atendente_id,
    para_atendente_id: atendenteId ?? null,
    comentario: comentario.trim(),
  });
  if (erroTransferencia) {
    return NextResponse.json({ error: erroTransferencia.message }, { status: 500 });
  }

  const { error: erroUpdate } = await supabase
    .from("atendimento_tickets")
    .update({
      departamento_id: departamentoId,
      atendente_id: atendenteId ?? null,
      status: atendenteId ? "ABERTO" : "FILA",
    })
    .eq("id", ticketId);
  if (erroUpdate) {
    return NextResponse.json({ error: erroUpdate.message }, { status: 500 });
  }

  await supabase.from("atendimento_mensagens").insert({
    ticket_id: ticketId,
    remetente_tipo: "SISTEMA",
    atendente_id: user.id,
    interno: true,
    corpo: `Chamado transferido — comentário: "${comentario.trim()}"`,
    status: "ENVIADA",
  });

  await logAudit({
    action: "atendimento.transferir",
    entity: "atendimento_tickets",
    entityId: ticketId,
    oldValue: { departamento_id: ticketAtual.departamento_id, atendente_id: ticketAtual.atendente_id },
    newValue: { departamento_id: departamentoId, atendente_id: atendenteId ?? null },
  });

  return NextResponse.json({ ok: true });
}
