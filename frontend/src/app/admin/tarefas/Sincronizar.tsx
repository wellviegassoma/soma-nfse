"use client";

import { useEffect, useState, useTransition } from "react";
import { sincronizarTarefasAction } from "@/lib/actions/tarefas";

const CHAVE = "tarefas:ultimaSync";
const INTERVALO = 15 * 60 * 1000; // ao abrir a tela, no máximo a cada 15 min

/**
 * Conclui tarefas/etapas pelo que já foi feito nas centrais (Simples, ISS,
 * Reinf, MIT…). Roda sozinho ao abrir a tela de Tarefas (com intervalo) e
 * pelo botão; o cron diário faz o mesmo.
 */
export function Sincronizar() {
  const [msg, setMsg] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const rodar = () =>
    iniciar(async () => {
      const r = await sincronizarTarefasAction();
      setMsg("error" in r ? `Erro: ${r.error}` : (r.mensagem ?? null));
      try {
        localStorage.setItem(CHAVE, String(Date.now()));
      } catch {}
    });

  useEffect(() => {
    let ultima = 0;
    try {
      ultima = Number(localStorage.getItem(CHAVE) ?? 0);
    } catch {}
    if (Date.now() - ultima > INTERVALO) rodar();
  }, []);

  return (
    <div className="flex items-center gap-2 text-xs">
      {msg && <span className="text-foreground/60">{msg}</span>}
      <button
        type="button"
        onClick={rodar}
        disabled={pendente}
        title="Conclui o que já foi feito nas centrais (Simples, ISS, Reinf, MIT…)"
        className="rounded-lg border border-border bg-surface px-2.5 py-1.5 font-medium text-foreground hover:bg-surface-muted disabled:opacity-50"
      >
        {pendente ? "Sincronizando…" : "Sincronizar com as centrais"}
      </button>
    </div>
  );
}
