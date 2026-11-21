"use client";

import { useTransition } from "react";
import { apagarRegraVencimento } from "@/lib/actions/legalizacao";
import { Button } from "@/components/ui/Button";

export function ApagarRegraButton({ regraId, descricao }: { regraId: string; descricao: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="secondary"
      className="h-8 px-3 text-xs"
      loading={pending}
      onClick={() => {
        if (!confirm(`Apagar a regra "${descricao}"?`)) return;
        startTransition(() => apagarRegraVencimento(regraId));
      }}
    >
      Apagar
    </Button>
  );
}
