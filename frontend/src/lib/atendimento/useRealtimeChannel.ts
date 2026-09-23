"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type EventoRealtime = "INSERT" | "UPDATE" | "DELETE" | "*";

// Hook compartilhado pelas telas que escutam mudança de tabela via
// Supabase Realtime (TicketListRealtime, TicketChat, ConexaoCard) —
// extraído depois da revisão do PR apontar a mesma configuração de canal
// duplicada em cada uma. Guarda o callback num ref pra não precisar
// recriar o canal a cada render só porque o callback mudou de identidade.
export function useAtendimentoRealtime<T extends Record<string, unknown>>(
  canalNome: string,
  opcoes: { event: EventoRealtime; table: string; filter?: string },
  aoReceber: (payload: RealtimePostgresChangesPayload<T>) => void,
) {
  const aoReceberRef = useRef(aoReceber);
  useEffect(() => {
    aoReceberRef.current = aoReceber;
  });

  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel(canalNome)
      .on(
        "postgres_changes",
        { event: opcoes.event, schema: "public", table: opcoes.table, filter: opcoes.filter },
        (payload: RealtimePostgresChangesPayload<T>) => aoReceberRef.current(payload),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [canalNome, opcoes.event, opcoes.table, opcoes.filter]);
}
