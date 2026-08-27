"use client";

import { useTransition } from "react";
import { apagarDocumentoLegalizacao } from "@/lib/actions/legalizacao";
import { Button } from "@/components/ui/Button";

export function DeleteLegalizacaoDocumentoButton({
  documentoId,
  companyId,
}: {
  documentoId: string;
  companyId: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      loading={pending}
      className="text-xs text-danger"
      onClick={() => {
        if (!confirm("Remover este documento?")) return;
        startTransition(() => apagarDocumentoLegalizacao(documentoId, companyId));
      }}
    >
      Remover
    </Button>
  );
}
