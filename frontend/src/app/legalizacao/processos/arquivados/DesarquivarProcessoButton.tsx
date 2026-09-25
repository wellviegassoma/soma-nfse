"use client";

import { useTransition } from "react";
import { desarquivarProcesso } from "@/lib/actions/legalizacao-processos";
import { Button } from "@/components/ui/Button";

export function DesarquivarProcessoButton({ processoId }: { processoId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      size="md"
      className="h-8 px-3 text-xs"
      loading={pending}
      onClick={() => startTransition(() => desarquivarProcesso(processoId))}
    >
      Desarquivar
    </Button>
  );
}
