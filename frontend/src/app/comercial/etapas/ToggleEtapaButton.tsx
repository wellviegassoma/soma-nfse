"use client";

import { useTransition } from "react";
import { alternarAtivoEtapa } from "@/lib/actions/comercial";
import { Button } from "@/components/ui/Button";

export function ToggleEtapaButton({ etapaId, ativo }: { etapaId: string; ativo: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      size="md"
      className="h-7 px-2 text-xs"
      loading={pending}
      onClick={() => startTransition(() => alternarAtivoEtapa(etapaId, !ativo))}
    >
      {ativo ? "Inativar" : "Reativar"}
    </Button>
  );
}
