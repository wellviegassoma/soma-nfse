import { NextResponse } from "next/server";
import { requireAtendimentoAccess, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Inicia um chamado a partir de um contato da agenda do WhatsApp (em vez
// de esperar ele mandar mensagem primeiro) — acha/cria o contato,
// reaproveita um chamado já em aberto pra ele se existir (não duplica),
// senão cria um novo já assumido por quem está iniciando, e manda a
// primeira mensagem.
export async function POST(request: Request) {
  await requireAtendimentoAccess();
  const user = await requireUser();

  const { jid, nome, telefone, departamento_id: departamentoId, corpo } = await request.json();
  if (!jid || !telefone || !departamentoId || typeof corpo !== "string" || !corpo.trim()) {
    return NextResponse.json(
      { error: "Informe jid, telefone, departamento e a primeira mensagem." },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  const { data: conexao, error: erroConexao } = await supabase
    .from("atendimento_conexoes")
    .select("id")
    .eq("status", "CONECTADO")
    .limit(1)
    .maybeSingle();
  if (erroConexao || !conexao) {
    return NextResponse.json({ error: "Nenhuma conexão de WhatsApp está conectada agora." }, { status: 409 });
  }

  const { data: contatoExistente, error: erroContato } = await supabase
    .from("atendimento_contatos")
    .select("id, jid")
    .eq("conexao_id", conexao.id)
    .eq("telefone", telefone)
    .maybeSingle();
  if (erroContato) {
    return NextResponse.json({ error: erroContato.message }, { status: 500 });
  }

  let contatoId = contatoExistente?.id;
  if (!contatoId) {
    const { data: novoContato, error: erroNovoContato } = await supabase
      .from("atendimento_contatos")
      .insert({ conexao_id: conexao.id, telefone, jid, nome: nome || null })
      .select("id")
      .single();
    if (erroNovoContato) {
      return NextResponse.json({ error: erroNovoContato.message }, { status: 500 });
    }
    contatoId = novoContato.id;
  } else if (!contatoExistente?.jid) {
    // Contato já existia (de antes da correção do jid) sem endereço de
    // envio salvo — a agenda do WhatsApp tem o jid certo, aproveita.
    await supabase.from("atendimento_contatos").update({ jid }).eq("id", contatoId);
  }

  // Reaproveita chamado já em aberto pra esse contato em vez de duplicar
  // — mesma regra do whatsapp-connector pro fluxo inbound.
  const { data: ticketExistente } = await supabase
    .from("atendimento_tickets")
    .select("id")
    .eq("contato_id", contatoId)
    .in("status", ["FILA", "ABERTO"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let ticketId = ticketExistente?.id;
  if (!ticketId) {
    const { data: novoTicket, error: erroTicket } = await supabase
      .from("atendimento_tickets")
      .insert({
        contato_id: contatoId,
        departamento_id: departamentoId,
        atendente_id: user.id,
        status: "ABERTO",
      })
      .select("id")
      .single();
    if (erroTicket) {
      return NextResponse.json({ error: erroTicket.message }, { status: 500 });
    }
    ticketId = novoTicket.id;
  } else {
    await supabase
      .from("atendimento_tickets")
      .update({ atendente_id: user.id, status: "ABERTO", departamento_id: departamentoId })
      .eq("id", ticketId);
  }

  const { data: mensagem, error: erroInsert } = await supabase
    .from("atendimento_mensagens")
    .insert({
      ticket_id: ticketId,
      remetente_tipo: "ATENDENTE",
      atendente_id: user.id,
      corpo: corpo.trim(),
      status: "ENVIANDO",
    })
    .select("id")
    .single();
  if (erroInsert) {
    return NextResponse.json({ error: erroInsert.message }, { status: 500 });
  }

  const connectorUrl = process.env.WHATSAPP_CONNECTOR_URL;
  const connectorToken = process.env.WHATSAPP_CONNECTOR_INTERNAL_TOKEN;
  if (!connectorUrl || !connectorToken) {
    await supabase.from("atendimento_mensagens").update({ status: "FALHOU" }).eq("id", mensagem.id);
    return NextResponse.json(
      { error: "Conector do WhatsApp não configurado (WHATSAPP_CONNECTOR_URL)." },
      { status: 500 },
    );
  }

  try {
    const { data: perfil } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
    const corpoAssinado = perfil?.full_name ? `*${perfil.full_name}:*\n${corpo.trim()}` : corpo.trim();

    const resposta = await fetch(`${connectorUrl}/enviar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Token": connectorToken },
      body: JSON.stringify({ jid, telefone, corpo: corpoAssinado }),
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

  return NextResponse.json({ ok: true, ticket_id: ticketId });
}
