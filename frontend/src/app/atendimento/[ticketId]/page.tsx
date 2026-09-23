import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InboxShell } from "@/components/atendimento/InboxShell";
import { TicketChat } from "@/components/atendimento/TicketChat";
import type { Mensagem, TicketDetalhe } from "@/lib/atendimento/types";

export const metadata = { title: "Atendimento — Chamado" };

export default async function TicketPage(props: PageProps<"/atendimento/[ticketId]">) {
  const { ticketId } = await props.params;
  const searchParams = await props.searchParams;
  const aba = typeof searchParams.aba === "string" ? searchParams.aba : "fila";

  const supabase = await createClient();
  const [
    { data: ticket, error: erroTicket },
    { data: mensagens },
    { data: departamentos },
    { data: perfis },
    { data: assuntos },
    { data: membros },
  ] = await Promise.all([
    supabase
      .from("atendimento_tickets")
      .select(
        "id, protocolo, status, departamento_id, atendente_id, nao_lida, contato:atendimento_contatos(id, nome, telefone, company_id, company:companies(id, legal_name, trade_name))",
      )
      .eq("id", ticketId)
      .single(),
    supabase
      .from("atendimento_mensagens")
      .select(
        "id, ticket_id, remetente_tipo, atendente_id, corpo, midia_url, midia_tipo, interno, status, created_at, atendente:profiles(full_name)",
      )
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true }),
    supabase.from("atendimento_departamentos").select("id, nome").eq("ativo", true).order("nome"),
    // Mapa id -> nome pra resolver o remetente de mensagem que chega
    // depois via Realtime (postgres_changes não traz join nenhum).
    supabase.from("profiles").select("id, full_name"),
    supabase.from("atendimento_assuntos").select("id, nome").eq("ativo", true).order("nome"),
    supabase
      .from("atendimento_usuario_departamentos")
      .select("departamento_id, user_id, atendente:profiles(full_name)"),
  ]);

  if (erroTicket || !ticket) notFound();

  // Abrir a tela do chamado marca como lida — só quando abre responder já
  // implica ter visto, e assim não precisa de um botão "marcar como lida"
  // separado. Não bloqueia o render (fire-and-forget): é cosmético, não
  // precisa esperar a escrita terminar pra mostrar a conversa.
  if ((ticket as unknown as { nao_lida: boolean }).nao_lida) {
    void supabase.from("atendimento_tickets").update({ nao_lida: false }).eq("id", ticketId);
  }

  const nomesAtendentes = Object.fromEntries(
    (perfis ?? []).map((p) => [p.id, p.full_name ?? "Atendente"]),
  );

  // Sem membro cadastrado pra nenhum departamento (tabela nasce vazia —
  // ver migration), cai pra mostrar todo mundo em vez de um seletor
  // vazio e inútil.
  const atendentesPorDepartamento: Record<string, { id: string; nome: string }[]> = {};
  for (const m of (membros ?? []) as unknown as {
    departamento_id: string;
    user_id: string;
    atendente: { full_name: string | null } | null;
  }[]) {
    const lista = (atendentesPorDepartamento[m.departamento_id] ??= []);
    lista.push({ id: m.user_id, nome: m.atendente?.full_name || "Atendente" });
  }
  const todosAtendentes = (perfis ?? []).map((p) => ({ id: p.id, nome: p.full_name || "Atendente" }));

  return (
    <InboxShell aba={aba} selectedTicketId={ticketId}>
      <TicketChat
        key={ticket.id}
        ticket={ticket as unknown as TicketDetalhe}
        mensagensIniciais={(mensagens ?? []) as unknown as Mensagem[]}
        departamentos={departamentos ?? []}
        nomesAtendentes={nomesAtendentes}
        assuntos={assuntos ?? []}
        atendentesPorDepartamento={atendentesPorDepartamento}
        todosAtendentes={todosAtendentes}
      />
    </InboxShell>
  );
}
