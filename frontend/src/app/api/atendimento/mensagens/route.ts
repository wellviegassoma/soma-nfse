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
    .select("id, status, atendente_id, contato:atendimento_contatos(telefone, jid)")
    .eq("id", ticketId)
    .single();
  if (erroTicket || !ticket) {
    return NextResponse.json({ error: "Chamado não encontrado." }, { status: 404 });
  }
  if (ticket.status === "FECHADO") {
    return NextResponse.json({ error: "Chamado está fechado." }, { status: 409 });
  }

  const ehInterno = interno === true;

  // Responder assume o chamado — achado direto de uso real: sem isso, um
  // chamado ficava "ABERTO" mas sem atendente_id, ou preso com quem tinha
  // assumido antes mesmo depois de outra pessoa já estar respondendo.
  // Quem quiser passar pra outro atendente usa Transferir normalmente.
  if (!ehInterno && ticket.atendente_id !== user.id) {
    await supabase
      .from("atendimento_tickets")
      .update({ atendente_id: user.id, status: "ABERTO" })
      .eq("id", ticketId);
  }

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
  const contato = (ticket as unknown as { contato: { telefone: string; jid: string | null } | null }).contato;

  if (!connectorUrl || !connectorToken || !contato) {
    await supabase.from("atendimento_mensagens").update({ status: "FALHOU" }).eq("id", mensagem.id);
    return NextResponse.json(
      { error: "Conector do WhatsApp não configurado (WHATSAPP_CONNECTOR_URL)." },
      { status: 500 },
    );
  }

  try {
    const { data: perfil } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
    // Assina pro cliente saber com quem está falando — só no texto
    // mandado pro WhatsApp, o `corpo` gravado fica limpo porque a bolha
    // no inbox já mostra o nome (ver TicketChat.tsx).
    const corpoAssinado = perfil?.full_name ? `*${perfil.full_name}:*\n${corpo.trim()}` : corpo.trim();

    // Prefere o jid guardado (correto pra @lid e @s.whatsapp.net); o
    // connector só reconstrói a partir do telefone pra contato antigo que
    // ainda não teve o jid preenchido pela auto-cura — ver
    // whatsapp-connector/src/baileys.js.
    const resposta = await fetch(`${connectorUrl}/enviar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Token": connectorToken },
      body: JSON.stringify({ jid: contato.jid, telefone: contato.telefone, corpo: corpoAssinado }),
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
