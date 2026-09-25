"use client";

import { useTransition } from "react";
import { desarquivarProspect } from "@/lib/actions/comercial";
import { Button } from "@/components/ui/Button";

export function DesarquivarButton({ prospectId }: { prospectId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      size="md"
      className="h-8 px-3 text-xs"
      loading={pending}
      onClick={() => startTransition(() => desarquivarProspect(prospectId))}
    >
      Desarquivar
    </Button>
  );
}
