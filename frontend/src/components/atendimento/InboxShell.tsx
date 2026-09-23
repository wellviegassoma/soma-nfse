import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TicketListRealtime } from "./TicketListRealtime";
import type { TicketResumo } from "@/lib/atendimento/types";

export async function InboxShell({
  aba,
  selectedTicketId,
  children,
}: {
  aba: string;
  selectedTicketId?: string;
  children: ReactNode;
}) {
  const user = await requireUser();
  const supabase = await createClient();

  let query = supabase
    .from("atendimento_tickets")
    .select(
      "id, protocolo, status, departamento_id, atendente_id, aberto_em, contato:atendimento_contatos(id, nome, telefone, company_id), departamento:atendimento_departamentos(nome), atendente:profiles(full_name)",
    )
    .order("aberto_em", { ascending: false })
    .limit(100);

  if (aba === "fila") {
    query = query.eq("status", "FILA");
  } else if (aba === "minhas") {
    query = query.eq("atendente_id", user.id).eq("status", "ABERTO");
  }
  // aba === "todas": sem filtro extra.

  const { data, error } = await query;
  if (error) throw error;
  const tickets = (data ?? []) as unknown as TicketResumo[];

  return (
    <div className="grid h-full grid-cols-[320px_1fr]">
      <TicketListRealtime tickets={tickets} aba={aba} selectedTicketId={selectedTicketId} />
      <div className="flex min-w-0 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
