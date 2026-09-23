import { NextResponse } from "next/server";
import { requireAtendimentoAccess, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Envia mensagem de um atendente: grava a linha primeiro (status ENVIANDO
// ou ENVIADA se for nota interna), e só chama o whatsapp-connector se não
// for nota interna. Se o connector falhar, a linha fica FALHOU em vez de
// sumir — o atendente vê que não foi e pode tentar de novo, em vez de
// achar que mandou e o cliente nunca ver.
export async function POST(request: Request) {
  await requireAtendimentoAccess();
  const user = await requireUser();

  const { ticket_id: ticketId, corpo, interno } = await request.json();
  if (!ticketId || typeof corpo !== "string" || !corpo.trim()) {
    return NextResponse.json({ error: "Informe ticket_id e corpo." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: ticket, error: erroTicket } = await supabase
    .from("atendimento_tickets")
    .select("id, status, contato:atendimento_contatos(telefone)")
    .eq("id", ticketId)
    .single();
  if (erroTicket || !ticket) {
    return NextResponse.json({ error: "Chamado não encontrado." }, { status: 404 });
  }
  if (ticket.status === "FECHADO") {
    return NextResponse.json({ error: "Chamado está fechado." }, { status: 409 });
  }

  const ehInterno = interno === true;

  const { data: mensagem, error: erroInsert } = await supabase
    .from("atendimento_mensagens")
    .insert({
      ticket_id: ticketId,
      remetente_tipo: "ATENDENTE",
      atendente_id: user.id,
      corpo: corpo.trim(),
      interno: ehInterno,
      status: ehInterno ? "ENVIADA" : "ENVIANDO",
    })
    .select("id")
    .single();
  if (erroInsert) {
    return NextResponse.json({ error: erroInsert.message }, { status: 500 });
  }

  if (ehInterno) {
    return NextResponse.json({ ok: true, id: mensagem.id });
  }

  const connectorUrl = process.env.WHATSAPP_CONNECTOR_URL;
  const connectorToken = process.env.WHATSAPP_CONNECTOR_INTERNAL_TOKEN;
  const telefone = (ticket as unknown as { contato: { telefone: string } | null }).contato?.telefone;

  if (!connectorUrl || !connectorToken || !telefone) {
    await supabase.from("atendimento_mensagens").update({ status: "FALHOU" }).eq("id", mensagem.id);
    return NextResponse.json(
      { error: "Conector do WhatsApp não configurado (WHATSAPP_CONNECTOR_URL)." },
      { status: 500 },
    );
  }

  try {
    const resposta = await fetch(`${connectorUrl}/enviar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Token": connectorToken },
      body: JSON.stringify({ telefone, corpo: corpo.trim() }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.error || "Falha ao enviar mensagem.");

    await supabase
      .from("atendimento_mensagens")
      .update({ status: "ENVIADA", whatsapp_message_id: dados.whatsapp_message_id ?? null })
      .eq("id", mensagem.id);
  } catch (err) {
    await supabase.from("atendimento_mensagens").update({ status: "FALHOU" }).eq("id", mensagem.id);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao enviar mensagem." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, id: mensagem.id });
}
