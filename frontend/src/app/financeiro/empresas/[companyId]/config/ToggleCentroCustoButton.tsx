"use client";

import { useActionState } from "react";
import { alternarCentroCustoAtivo } from "@/lib/actions/financeiro";
import { Button } from "@/components/ui/Button";

export function ToggleCentroCustoButton({
  companyId,
  centroId,
  ativo,
}: {
  companyId: string;
  centroId: string;
  ativo: boolean;
}) {
  const [, formAction, pending] = useActionState(alternarCentroCustoAtivo, undefined);

  return (
    <form action={formAction} className="shrink-0">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="centroId" value={centroId} />
      <input type="hidden" name="ativo" value={ativo ? "false" : "true"} />
      <Button type="submit" variant="secondary" loading={pending}>
        {ativo ? "Inativar" : "Reativar"}
      </Button>
    </form>
  );
}
