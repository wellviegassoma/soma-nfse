"use client";

import { useTransition } from "react";
import { alternarAtivoTipoDocumento } from "@/lib/actions/legalizacao";
import { Button } from "@/components/ui/Button";

export function ToggleTipoDocumentoButton({
  tipoId,
  ativo,
}: {
  tipoId: string;
  ativo: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      loading={pending}
      onClick={() => startTransition(() => alternarAtivoTipoDocumento(tipoId, !ativo))}
    >
      {ativo ? "Inativar" : "Reativar"}
    </Button>
  );
}
