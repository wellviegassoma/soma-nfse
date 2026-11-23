"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { atualizarDeclaracaoAction } from "@/lib/actions/irpf";
import { STATUS_LABEL, type StatusDeclaracao } from "@/lib/irpf/comum";

export function AcoesRelatorio({ declaracaoId, status }: { declaracaoId: string; status: StatusDeclaracao }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const mudar = (s: StatusDeclaracao) =>
    start(async () => {
      const r = await atualizarDeclaracaoAction({ id: declaracaoId, status: s });
      setMsg("error" in r ? r.error : `Situação: ${STATUS_LABEL[s]}`);
    });

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Button onClick={() => window.print()}>Imprimir / salvar PDF</Button>
      {status !== "AGUARDANDO_APROVACAO" && status !== "APROVADA" && status !== "TRANSMITIDA" && (
        <Button variant="secondary" loading={pending} onClick={() => mudar("AGUARDANDO_APROVACAO")}>
          Marcar como enviado ao cliente
        </Button>
      )}
      {status === "AGUARDANDO_APROVACAO" && (
        <Button variant="secondary" loading={pending} onClick={() => mudar("APROVADA")}>
          Cliente aprovou
        </Button>
      )}
      <span className="text-xs text-foreground/55">
        {msg ?? "Envie o PDF pelo e-mail ou eContador. A situação muda aqui quando você marcar."}
      </span>
    </div>
  );
}
