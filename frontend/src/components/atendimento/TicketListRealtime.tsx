"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
import type { TicketResumo } from "@/lib/atendimento/types";

const ABAS = [
  { valor: "fila", rotulo: "Fila" },
  { valor: "minhas", rotulo: "Minhas" },
  { valor: "todas", rotulo: "Todas" },
] as const;

// router.refresh() re-executa o Server Component (InboxShell) que busca a
// lista — mais simples que duplicar a query no cliente, e consistente com
// o resto do projeto (que não usa Realtime em nenhum outro módulo ainda).
// Custo: um refresh a mais do que o estritamente necessário quando o
// evento não afeta a aba atual — aceitável pro volume de um inbox interno.
export function TicketListRealtime({
  tickets,
  aba,
  selectedTicketId,
}: {
  tickets: TicketResumo[];
  aba: string;
  selectedTicketId?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel("atendimento-tickets-lista")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "atendimento_tickets" },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [router]);

  return (
    <div className="flex h-full flex-col border-r border-border">
      <div className="flex gap-1 border-b border-border p-2">
        {ABAS.map((item) => (
          <Link
            key={item.valor}
            href={`/atendimento?aba=${item.valor}`}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium",
              aba === item.valor
                ? "bg-brand text-brand-foreground"
                : "text-foreground/60 hover:bg-surface-muted",
            )}
          >
            {item.rotulo}
          </Link>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tickets.length === 0 && (
          <p className="p-4 text-sm text-foreground/50">Nenhum chamado aqui.</p>
        )}
        {tickets.map((ticket) => (
          <Link
            key={ticket.id}
            href={`/atendimento/${ticket.id}?aba=${aba}`}
            className={cn(
              "block border-b border-border px-4 py-3 hover:bg-surface-muted",
              selectedTicketId === ticket.id && "bg-surface-muted",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-foreground">
                {ticket.contato?.nome || ticket.contato?.telefone || "Sem nome"}
              </span>
              <span className="shrink-0 text-xs text-foreground/45">{ticket.protocolo}</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-foreground/55">
              <span className="truncate">{ticket.departamento?.nome}</span>
              {ticket.atendente?.full_name && (
                <span className="shrink-0 truncate">{ticket.atendente.full_name}</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
