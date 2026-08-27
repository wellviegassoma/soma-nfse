"use client";

import { useState, useTransition } from "react";
import { apagarDocumentoSocio } from "@/lib/actions/societario";
import { Button } from "@/components/ui/Button";

export function DeleteDocumentoSocioButton({
  documentoId,
  companyId,
}: {
  documentoId: string;
  companyId: string;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [pending, startTransition] = useTransition();

  if (confirmando) {
    return (
      <span className="inline-flex items-center gap-2 text-xs">
        <span className="text-foreground/70">Remover?</span>
        <Button
          type="button"
          variant="danger"
          size="md"
          className="h-6 px-2 text-xs"
          loading={pending}
          onClick={() => startTransition(() => apagarDocumentoSocio(documentoId, companyId))}
        >
          Sim
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="md"
          className="h-6 px-2 text-xs"
          disabled={pending}
          onClick={() => setConfirmando(false)}
        >
          Cancelar
        </Button>
      </span>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="md"
      className="h-6 px-2 text-xs text-danger"
      onClick={() => setConfirmando(true)}
    >
      Remover
    </Button>
  );
}
