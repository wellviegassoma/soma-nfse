"use client";

import { useState, useTransition } from "react";
import { apagarDocumentoLegalizacao } from "@/lib/actions/legalizacao";
import { Button } from "@/components/ui/Button";

export function DeleteLegalizacaoDocumentoButton({
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
      <div className="flex items-center gap-2 text-xs">
        <span className="text-foreground/70">Remover este documento?</span>
        <Button
          type="button"
          variant="danger"
          size="md"
          className="h-7 px-2.5 text-xs"
          loading={pending}
          onClick={() => startTransition(() => apagarDocumentoLegalizacao(documentoId, companyId))}
        >
          Sim, remover
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="md"
          className="h-7 px-2.5 text-xs"
          disabled={pending}
          onClick={() => setConfirmando(false)}
        >
          Cancelar
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="md"
      className="h-7 px-2.5 text-xs text-danger"
      onClick={() => setConfirmando(true)}
    >
      Remover
    </Button>
  );
}
