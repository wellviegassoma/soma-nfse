"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import {
  adicionarItemChecklistAction,
  mudarItemChecklistAction,
  sugerirChecklistAction,
} from "@/lib/actions/irpf";
import type { ChecklistStatus } from "@/lib/irpf/comum";

type Item = { id: string; categoria: string; descricao: string; status: ChecklistStatus; origem: string };

const PROXIMO: Record<ChecklistStatus, ChecklistStatus> = {
  PENDENTE: "RECEBIDO",
  RECEBIDO: "NAO_SE_APLICA",
  NAO_SE_APLICA: "PENDENTE",
};
const ICONE: Record<ChecklistStatus, string> = { PENDENTE: "○", RECEBIDO: "✓", NAO_SE_APLICA: "–" };

export function ChecklistDeclaracao({ declaracaoId, itens }: { declaracaoId: string; itens: Item[] }) {
  const [pending, start] = useTransition();
  const [novo, setNovo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const categorias = [...new Set(itens.map((i) => i.categoria))];
  const recebidos = itens.filter((i) => i.status === "RECEBIDO").length;
  const validos = itens.filter((i) => i.status !== "NAO_SE_APLICA").length;

  const rodar = (f: () => Promise<{ error: string } | { ok: true }>) =>
    start(async () => {
      const r = await f();
      setMsg("error" in r ? r.error : null);
    });

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-foreground/70">
          Documentos {validos > 0 && <span className="font-normal text-foreground/50">({recebidos}/{validos})</span>}
        </div>
        <button
          type="button"
          className="text-xs text-brand hover:underline disabled:opacity-50"
          disabled={pending}
          onClick={() => rodar(() => sugerirChecklistAction(declaracaoId))}
        >
          {itens.length ? "Completar sugestões" : "Gerar checklist"}
        </button>
      </div>
      <p className="text-xs text-foreground/45">Clique no item para marcar: pendente → recebido → não se aplica.</p>
      {categorias.map((cat) => (
        <div key={cat} className="flex flex-col gap-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/40">{cat}</div>
          {itens
            .filter((i) => i.categoria === cat)
            .map((i) => (
              <div key={i.id} className="group flex items-start gap-2 text-sm">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => rodar(() => mudarItemChecklistAction({ declaracaoId, itemId: i.id, status: PROXIMO[i.status] }))}
                  className={cn(
                    "flex min-w-0 flex-1 items-start gap-2 text-left",
                    i.status === "RECEBIDO" && "text-success",
                    i.status === "NAO_SE_APLICA" && "text-foreground/35 line-through",
                  )}
                >
                  <span className="w-4 shrink-0 text-center">{ICONE[i.status]}</span>
                  <span className="min-w-0">{i.descricao}</span>
                </button>
                {i.origem === "MANUAL" && (
                  <button
                    type="button"
                    className="hidden text-xs text-foreground/40 hover:text-danger group-hover:inline"
                    onClick={() => rodar(() => mudarItemChecklistAction({ declaracaoId, itemId: i.id, remover: true }))}
                    title="Remover"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
        </div>
      ))}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!novo.trim()) return;
          rodar(async () => {
            const r = await adicionarItemChecklistAction({ declaracaoId, categoria: "Outros", descricao: novo });
            if (!("error" in r)) setNovo("");
            return r;
          });
        }}
      >
        <Input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Outro documento…" className="h-9 text-sm" />
        <Button type="submit" variant="secondary" className="h-9" disabled={pending}>
          +
        </Button>
      </form>
      {msg && <span className="text-xs text-danger">{msg}</span>}
    </Card>
  );
}
