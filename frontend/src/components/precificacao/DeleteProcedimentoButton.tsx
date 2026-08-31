"use client";

import { useTransition } from "react";
import { deleteProcedimento } from "@/lib/actions/precificacao";
import { Button } from "@/components/ui/Button";

export function DeleteProcedimentoButton({
  companyId,
  procedimentoId,
  basePath,
}: {
  companyId: string;
  procedimentoId: string;
  basePath: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="danger"
      disabled={pending}
      onClick={() => {
        if (!confirm("Excluir este procedimento? Essa ação não pode ser desfeita.")) return;
        startTransition(() => deleteProcedimento(companyId, procedimentoId, basePath));
      }}
    >
      Excluir procedimento
    </Button>
  );
}
