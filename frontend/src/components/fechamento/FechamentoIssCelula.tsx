"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { marcarIssEmitidaPorFora, desmarcarIssEmitidaPorFora } from "@/lib/actions/iss-fechamentos";

export type FechamentoIssResumo = {
  origem: "sistema" | "manual";
  valorGuia: number | null;
  observacao: string | null;
  marcadoEm: string;
} | null;

function data(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// Coluna "Fechamento" das Centrais de ISS: mostra se a guia já saiu pelo
// sistema (marcado sozinho na emissão) ou se alguém marcou "emitida por
// fora"; sem marcação, oferece o botão pra marcar.
export function FechamentoIssCelula({
  companyId,
  competencia,
  fechamento,
  podeMarcar,
}: {
  companyId: string;
  competencia: string;
  fechamento: FechamentoIssResumo;
  podeMarcar: boolean;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function executar(acao: () => Promise<{ ok: true } | { ok: false; erro: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await acao();
      if (!r.ok) setErro(r.erro);
      else router.refresh();
    });
  }

  if (fechamento?.origem === "sistema") {
    return (
      <span
        className="inline-block rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success"
        title={`Guia emitida pelo sistema em ${data(fechamento.marcadoEm)}`}
      >
        Pelo sistema
      </span>
    );
  }

  if (fechamento?.origem === "manual") {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <span
          className="inline-block rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand"
          title={`Marcado em ${data(fechamento.marcadoEm)}${fechamento.observacao ? ` — ${fechamento.observacao}` : ""}`}
        >
          Por fora
        </span>
        {podeMarcar && (
          <button
            type="button"
            disabled={pendente}
            onClick={() => executar(() => desmarcarIssEmitidaPorFora(companyId, competencia))}
            className="text-xs text-foreground/50 underline hover:text-foreground disabled:opacity-50"
          >
            desfazer
          </button>
        )}
        {erro && <span className="block text-xs text-danger">{erro}</span>}
      </span>
    );
  }

  if (!podeMarcar) return <span className="text-xs text-foreground/40">Pendente</span>;

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        type="button"
        disabled={pendente}
        onClick={() => {
          const observacao = window.prompt("Guia emitida por fora do sistema. Observação (opcional):", "");
          if (observacao === null) return;
          executar(() => marcarIssEmitidaPorFora(companyId, competencia, observacao));
        }}
        className="rounded-full border border-border px-2 py-0.5 text-xs text-foreground/60 hover:bg-surface-muted disabled:opacity-50"
      >
        {pendente ? "Marcando…" : "Marcar emitida por fora"}
      </button>
      {erro && <span className="text-xs text-danger">{erro}</span>}
    </span>
  );
}
