"use client";

import { useTransition } from "react";
import { alternarAtivoChecklistCategoria } from "@/lib/actions/comercial";
import { Button } from "@/components/ui/Button";

export function ToggleCategoriaButton({ categoriaId, ativo }: { categoriaId: string; ativo: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      size="md"
      className="h-7 px-2 text-xs"
      loading={pending}
      onClick={() => startTransition(() => alternarAtivoChecklistCategoria(categoriaId, !ativo))}
    >
      {ativo ? "Inativar" : "Reativar"}
    </Button>
  );
}
