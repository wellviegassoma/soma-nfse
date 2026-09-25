"use client";

import { useTransition } from "react";
import { alternarAtivoFaseTemplate } from "@/lib/actions/legalizacao-processos";
import { Button } from "@/components/ui/Button";

export function ToggleFaseTemplateButton({
  faseId,
  fluxoId,
  ativo,
}: {
  faseId: string;
  fluxoId: string;
  ativo: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      size="md"
      className="h-7 px-2 text-xs"
      loading={pending}
      onClick={() => startTransition(() => alternarAtivoFaseTemplate(faseId, fluxoId, !ativo))}
    >
      {ativo ? "Inativar" : "Reativar"}
    </Button>
  );
}
