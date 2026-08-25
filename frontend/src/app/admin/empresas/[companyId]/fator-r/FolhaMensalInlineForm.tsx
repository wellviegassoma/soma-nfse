"use client";

import { useActionState } from "react";
import { salvarFolhaMensal } from "@/lib/actions/folha";
import { Button } from "@/components/ui/Button";

export function FolhaMensalInlineForm({
  companyId,
  competencia,
  valorAtual,
}: {
  companyId: string;
  competencia: string;
  valorAtual: number | null;
}) {
  const [state, formAction, pending] = useActionState(salvarFolhaMensal, undefined);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="competencia" value={competencia} />
      <input
        name="valor"
        type="number"
        step="0.01"
        min={0}
        defaultValue={valorAtual ?? ""}
        placeholder="0,00"
        required
        className="w-28 rounded border border-border bg-surface px-2 py-1 text-sm"
      />
      <Button type="submit" variant="secondary" size="md" className="h-8 px-2 text-xs" loading={pending}>
        Salvar
      </Button>
      {state?.error && <span className="text-xs text-danger">{state.error}</span>}
      {state?.success && <span className="text-xs text-success">Salvo</span>}
    </form>
  );
}
