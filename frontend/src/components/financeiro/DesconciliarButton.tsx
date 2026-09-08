"use client";

import { useActionState } from "react";
import { desconciliarLinha } from "@/lib/actions/financeiro-extrato";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

/**
 * Escape hatch da conciliação. Apagar o lançamento derruba a conciliação em
 * cascata e dispara os dois triggers: a linha volta a PENDENTE e o agendamento
 * recalcula o que ainda está em aberto. Sem isso, um clique errado ficaria
 * gravado no saldo pra sempre.
 */
export function DesconciliarButton({
  companyId,
  linhaId,
}: {
  companyId: string;
  linhaId: string;
}) {
  const [state, formAction, pending] = useActionState(desconciliarLinha, undefined);

  return (
    <form action={formAction} className="flex shrink-0 items-center gap-2">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="linhaId" value={linhaId} />
      <Button type="submit" variant="secondary" loading={pending}>
        Desfazer
      </Button>
    </form>
  );
}
