"use client";

import { useActionState } from "react";
import { cancelarAgendamento } from "@/lib/actions/financeiro-lancamentos";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export function CancelarAgendamentoButton({
  companyId,
  agendamentoId,
}: {
  companyId: string;
  agendamentoId: string;
}) {
  const [state, formAction, pending] = useActionState(cancelarAgendamento, undefined);

  return (
    <form action={formAction} className="flex items-center gap-2">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="agendamentoId" value={agendamentoId} />
      <Button type="submit" variant="ghost" loading={pending}>
        Cancelar
      </Button>
    </form>
  );
}
