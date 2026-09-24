"use client";

import { useTransition } from "react";
import { alternarAtivoChecklistItem } from "@/lib/actions/comercial";
import { Button } from "@/components/ui/Button";

export function ToggleItemButton({ itemId, ativo }: { itemId: string; ativo: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="md"
      className="h-7 px-2 text-xs"
      loading={pending}
      onClick={() => startTransition(() => alternarAtivoChecklistItem(itemId, !ativo))}
    >
      {ativo ? "Inativar" : "Reativar"}
    </Button>
  );
}
