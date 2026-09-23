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
  const [{ data: ticket, error: erroTicket }, { data: mensagens }, { data: departamentos }] =
    await Promise.all([
      supabase
        .from("atendimento_tickets")
        .select(
          "id, protocolo, status, departamento_id, atendente_id, contato:atendimento_contatos(id, nome, telefone, company_id, company:companies(id, legal_name, trade_name))",
        )
        .eq("id", ticketId)
        .single(),
      supabase
        .from("atendimento_mensagens")
        .select(
          "id, ticket_id, remetente_tipo, atendente_id, corpo, midia_url, midia_tipo, interno, status, created_at",
        )
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true }),
      supabase.from("atendimento_departamentos").select("id, nome").eq("ativo", true).order("nome"),
    ]);

  if (erroTicket || !ticket) notFound();

  return (
    <InboxShell aba={aba} selectedTicketId={ticketId}>
      <TicketChat
        key={ticket.id}
        ticket={ticket as unknown as TicketDetalhe}
        mensagensIniciais={(mensagens ?? []) as unknown as Mensagem[]}
        departamentos={departamentos ?? []}
      />
    </InboxShell>
  );
}
