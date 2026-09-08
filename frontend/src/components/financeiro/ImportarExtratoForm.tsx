"use client";

import { useActionState } from "react";
import { importarExtrato } from "@/lib/actions/financeiro-extrato";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Alert } from "@/components/ui/Alert";

export function ImportarExtratoForm({
  companyId,
  contas,
}: {
  companyId: string;
  contas: { id: string; banco: string; agencia: string; conta: string }[];
}) {
  const [state, formAction, pending] = useActionState(importarExtrato, undefined);

  return (
    // key remonta o input de arquivo depois do envio — sem isso o nome do
    // arquivo anterior fica visível e dá a impressão de que não importou.
    <form key={state?.at ?? 0} action={formAction} className="flex flex-col gap-3">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.sucesso && <Alert tone="success">{state.sucesso}</Alert>}
      {state?.aviso && <Alert tone="warning">{state.aviso}</Alert>}

      <input type="hidden" name="companyId" value={companyId} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-foreground/60">
          Conta
          <div className="w-64">
            <Select name="contaId" required defaultValue={contas[0]?.id ?? ""}>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.banco} · {c.agencia}/{c.conta}
                </option>
              ))}
            </Select>
          </div>
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground/60">
          Arquivo (.ofx ou .csv)
          <input
            type="file"
            name="arquivo"
            accept=".ofx,.qfx,.csv,.txt"
            required
            className="h-11 w-72 rounded-lg border border-border bg-surface px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
        </label>
        <Button type="submit" loading={pending}>
          Importar
        </Button>
      </div>
    </form>
  );
}
