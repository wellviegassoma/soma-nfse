"use client";

import { useActionState } from "react";
import { atualizarPeriodoConta } from "@/lib/actions/extratos";
import { Button } from "@/components/ui/Button";

export function PeriodoContaForm({
  contaId,
  companyId,
  dataInicioAtual,
  dataFimAtual,
}: {
  contaId: string;
  companyId: string;
  dataInicioAtual: string | null;
  dataFimAtual: string | null;
}) {
  const [state, formAction, pending] = useActionState(atualizarPeriodoConta, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="contaId" value={contaId} />
      <input type="hidden" name="companyId" value={companyId} />
      <div className="flex flex-col gap-1">
        <label className="text-xs text-foreground/50">Início do controle</label>
        <input
          type="date"
          name="dataInicioControle"
          defaultValue={dataInicioAtual ?? ""}
          className="h-8 rounded border border-border bg-surface px-2 text-xs"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-foreground/50">Fim do controle</label>
        <input
          type="date"
          name="dataFimControle"
          defaultValue={dataFimAtual ?? ""}
          className="h-8 rounded border border-border bg-surface px-2 text-xs"
        />
      </div>
      <Button type="submit" variant="ghost" size="md" className="h-8 px-2 text-xs" loading={pending}>
        Salvar período
      </Button>
      {state?.error && <span className="text-xs text-danger">{state.error}</span>}
      {state?.success && <span className="text-xs text-success">Salvo</span>}
    </form>
  );
}
