"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { useAtendimentoRealtime } from "@/lib/atendimento/useRealtimeChannel";
import type { TicketResumo } from "@/lib/atendimento/types";

const ABAS = [
  { valor: "fila", rotulo: "Fila" },
  { valor: "minhas", rotulo: "Minhas" },
  { valor: "todas", rotulo: "Todas" },
] as const;

// router.refresh() re-executa o Server Component (InboxShell) que busca a
// lista — mais simples que duplicar a query no cliente, e consistente com
// o resto do projeto (que não usa Realtime em nenhum outro módulo ainda).
// O canal não filtra por departamento/atendente porque a aba "Todas" (e a
// necessidade de um atendente ver o volume mudar em outro departamento)
// exige ver qualquer mudança na tabela — o debounce abaixo é o que evita
// isso virar uma tempestade de refresh quando várias mudanças chegam
// juntas (achado na revisão do PR).
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refrescarComDebounce = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => router.refresh(), 400);
  }, [router]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useAtendimentoRealtime(
    "atendimento-tickets-lista",
    { event: "*", table: "atendimento_tickets" },
    refrescarComDebounce,
  );

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
