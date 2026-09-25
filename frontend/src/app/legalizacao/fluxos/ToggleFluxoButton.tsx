"use client";

import { useTransition } from "react";
import { alternarAtivoFluxo } from "@/lib/actions/legalizacao-processos";
import { Button } from "@/components/ui/Button";

export function ToggleFluxoButton({ fluxoId, ativo }: { fluxoId: string; ativo: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      size="md"
      className="h-7 px-2 text-xs"
      loading={pending}
      onClick={() => startTransition(() => alternarAtivoFluxo(fluxoId, !ativo))}
    >
      {ativo ? "Inativar" : "Reativar"}
    </Button>
  );
}
