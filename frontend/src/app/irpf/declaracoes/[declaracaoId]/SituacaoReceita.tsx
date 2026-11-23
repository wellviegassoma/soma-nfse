"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { salvarSituacaoReceitaAction } from "@/lib/actions/irpf";
import { SITUACAO_RECEITA, SITUACAO_RECEITA_LABEL, type SituacaoReceita as Situacao } from "@/lib/irpf/comum";

/** Situação na Receita depois da entrega (salva ao escolher). */
export function SituacaoReceita({
  id,
  situacao,
  desde,
  transmitida,
}: {
  id: string;
  situacao: Situacao | null;
  desde: string | null;
  transmitida: boolean;
}) {
  const [valor, setValor] = useState<string>(situacao ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="text-sm font-semibold text-foreground/70">Situação na Receita</div>
      {!transmitida && <p className="text-xs text-foreground/45">Preencha depois da entrega.</p>}
      <Select
        value={valor}
        disabled={pending}
        onChange={(e) => {
          const novo = e.target.value;
          setValor(novo);
          start(async () => {
            const r = await salvarSituacaoReceitaAction({ id, situacao: (novo || null) as Situacao | null });
            setMsg("error" in r ? r.error : "Salvo.");
          });
        }}
        className="h-10 text-sm"
      >
        <option value="">— sem informação —</option>
        {SITUACAO_RECEITA.map((s) => (
          <option key={s} value={s}>
            {SITUACAO_RECEITA_LABEL[s]}
          </option>
        ))}
      </Select>
      <div className="text-[11px] text-foreground/45">
        {desde && valor === (situacao ?? "") ? `Desde ${desde.split("-").reverse().join("/")}` : ""}
        {msg && <span className="ml-1 text-foreground/60">{msg}</span>}
      </div>
    </Card>
  );
}
