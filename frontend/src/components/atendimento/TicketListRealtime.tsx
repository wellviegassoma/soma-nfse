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

function formatarDataHora(iso: string | null) {
  if (!iso) return "";
  const data = new Date(iso);
  const hoje = new Date();
  const mesmoDia = data.toDateString() === hoje.toDateString();
  if (mesmoDia) {
    return data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// Beep sintetizado (Web Audio API) — evita depender de um arquivo de
// áudio hospedado. Navegador só libera som depois de alguma interação do
// usuário na página; falha em silêncio antes disso, sem quebrar nada.
function tocarSomNotificacao() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // ambiente sem suporte a Web Audio — segue sem som
  }
}

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
  naoLidasFila,
  naoLidasMinhas,
}: {
  tickets: TicketResumo[];
  aba: string;
  selectedTicketId?: string;
  naoLidasFila: number;
  naoLidasMinhas: number;
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

  useAtendimentoRealtime<Record<string, unknown>>(
    "atendimento-tickets-lista",
    { event: "*", table: "atendimento_tickets" },
    (payload) => {
      // nao_lida=true no payload cobre tanto chamado novo (INSERT, já
      // nasce não lido) quanto mensagem nova num chamado existente
      // (UPDATE via trigger) — é a única transição que a trigger produz,
      // então tocar o som aqui não soa por transferência/fechamento.
      if ((payload.new as { nao_lida?: boolean } | undefined)?.nao_lida) {
        tocarSomNotificacao();
      }
      refrescarComDebounce();
    },
  );

  return (
    <div className="flex h-full flex-col border-r border-border">
      <div className="flex gap-1 border-b border-border p-2">
        {ABAS.map((item) => {
          const contador = item.valor === "fila" ? naoLidasFila : item.valor === "minhas" ? naoLidasMinhas : 0;
          const ativa = aba === item.valor;
          return (
            <Link
              key={item.valor}
              href={`/atendimento?aba=${item.valor}`}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium",
                ativa ? "bg-brand text-brand-foreground" : "text-foreground/60 hover:bg-surface-muted",
              )}
            >
              {item.rotulo}
              {contador > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                    ativa ? "bg-brand-foreground/20 text-brand-foreground" : "bg-danger text-white",
                  )}
                >
                  {contador}
                </span>
              )}
            </Link>
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tickets.length === 0 && (
          <p className="p-4 text-sm text-foreground/50">Nenhum chamado aqui.</p>
        )}
        {tickets.map((ticket) => {
          const nome = ticket.contato?.nome || ticket.contato?.telefone || "Sem nome";
          const inicial = nome.trim().charAt(0).toUpperCase() || "?";
          const aguardandoResposta = ticket.ultima_mensagem_remetente_tipo === "CONTATO";

          return (
            <Link
              key={ticket.id}
              href={`/atendimento/${ticket.id}?aba=${aba}`}
              className={cn(
                "flex gap-2.5 border-b border-border px-3 py-3 hover:bg-surface-muted",
                selectedTicketId === ticket.id && "bg-surface-muted",
              )}
            >
              <div className="relative shrink-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/15 text-sm font-semibold text-brand">
                  {inicial}
                </div>
                {ticket.nao_lida && (
                  <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-surface bg-danger" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "truncate text-sm",
                      ticket.nao_lida ? "font-semibold text-foreground" : "font-medium text-foreground/80",
                    )}
                  >
                    {nome}
                  </span>
                  <span className="shrink-0 text-xs text-foreground/45">
                    {formatarDataHora(ticket.ultima_mensagem_em)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  {aguardandoResposta && (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning"
                      title="Aguardando resposta"
                    />
                  )}
                  <span
                    className={cn(
                      "truncate text-xs",
                      ticket.nao_lida ? "font-medium text-foreground/75" : "text-foreground/50",
                    )}
                  >
                    {ticket.ultima_mensagem_preview || "Sem mensagens ainda"}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-foreground/40">
                  <span className="truncate">{ticket.departamento?.nome}</span>
                  {ticket.atendente?.full_name && (
                    <span className="shrink-0 truncate">{ticket.atendente.full_name}</span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
