"use client";

import { useActionState } from "react";
import { salvarReceitaManual, apagarReceitaManual } from "@/lib/actions/faturamento";
import { Button } from "@/components/ui/Button";

export function ReceitaManualInlineForm({
  companyId,
  competencia,
  valorAtual,
}: {
  companyId: string;
  competencia: string;
  valorAtual: number | null;
}) {
  const [saveState, saveAction, savePending] = useActionState(salvarReceitaManual, undefined);
  const [deleteState, deleteAction, deletePending] = useActionState(apagarReceitaManual, undefined);

  return (
    <div className="flex items-center gap-2">
      <form action={saveAction} className="flex items-center gap-2">
        <input type="hidden" name="companyId" value={companyId} />
        <input type="hidden" name="competencia" value={competencia} />
        <input
          name="valor"
          type="number"
          step="0.01"
          min={0}
          defaultValue={valorAtual ?? ""}
          placeholder="Faturamento"
          required
          className="w-32 rounded border border-border bg-surface px-2 py-1 text-sm"
        />
        <Button type="submit" variant="secondary" size="md" className="h-8 px-2 text-xs" loading={savePending}>
          Salvar
        </Button>
      </form>
      {valorAtual != null && (
        <form action={deleteAction}>
          <input type="hidden" name="companyId" value={companyId} />
          <input type="hidden" name="competencia" value={competencia} />
          <Button
            type="submit"
            variant="secondary"
            size="md"
            className="h-8 px-2 text-xs text-danger"
            loading={deletePending}
          >
            Apagar
          </Button>
        </form>
      )}
      {saveState?.error && <span className="text-xs text-danger">{saveState.error}</span>}
      {deleteState?.error && <span className="text-xs text-danger">{deleteState.error}</span>}
    </div>
  );
}
