"use client";

import { useActionState } from "react";
import { alternarCategoriaAtiva } from "@/lib/actions/financeiro";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export function ToggleCategoriaButton({
  companyId,
  categoriaId,
  ativo,
}: {
  companyId: string;
  categoriaId: string;
  ativo: boolean;
}) {
  const [state, formAction, pending] = useActionState(alternarCategoriaAtiva, undefined);

  return (
    <form action={formAction} className="flex shrink-0 items-center gap-2">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="categoriaId" value={categoriaId} />
      <input type="hidden" name="ativo" value={ativo ? "false" : "true"} />
      <Button type="submit" variant="secondary" loading={pending}>
        {ativo ? "Inativar" : "Reativar"}
      </Button>
    </form>
  );
}
