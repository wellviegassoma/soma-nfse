"use client";

import { useTransition } from "react";
import { deleteModelo } from "@/lib/actions/precificacao-modelos";
import { Button } from "@/components/ui/Button";

export function DeleteModeloButton({ modeloId }: { modeloId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="danger"
      disabled={pending}
      onClick={() => {
        if (!confirm("Excluir este modelo e todos os seus insumos/procedimentos? Essa ação não pode ser desfeita.")) return;
        startTransition(() => deleteModelo(modeloId));
      }}
    >
      Excluir modelo
    </Button>
  );
}
