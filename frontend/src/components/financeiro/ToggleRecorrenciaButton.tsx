"use client";

import { useActionState } from "react";
import { alternarRecorrenciaAtiva } from "@/lib/actions/financeiro-lancamentos";
import { Button } from "@/components/ui/Button";

export function ToggleRecorrenciaButton({
  companyId,
  recorrenciaId,
  ativa,
}: {
  companyId: string;
  recorrenciaId: string;
  ativa: boolean;
}) {
  const [, formAction, pending] = useActionState(alternarRecorrenciaAtiva, undefined);

  return (
    <form action={formAction} className="shrink-0">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="recorrenciaId" value={recorrenciaId} />
      <input type="hidden" name="ativa" value={ativa ? "false" : "true"} />
      <Button type="submit" variant="secondary" loading={pending}>
        {ativa ? "Pausar" : "Reativar"}
      </Button>
    </form>
  );
}
