"use client";

import { useActionState } from "react";
import { alternarContatoAtivo } from "@/lib/actions/financeiro";
import { Button } from "@/components/ui/Button";

export function ToggleContatoButton({
  companyId,
  contatoId,
  ativo,
}: {
  companyId: string;
  contatoId: string;
  ativo: boolean;
}) {
  const [, formAction, pending] = useActionState(alternarContatoAtivo, undefined);

  return (
    <form action={formAction} className="shrink-0">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="contatoId" value={contatoId} />
      <input type="hidden" name="ativo" value={ativo ? "false" : "true"} />
      <Button type="submit" variant="secondary" loading={pending}>
        {ativo ? "Inativar" : "Reativar"}
      </Button>
    </form>
  );
}
