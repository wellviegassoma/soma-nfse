"use client";

import { useTransition } from "react";
import { alternarTipoAplicavel } from "@/lib/actions/legalizacao";
import { Switch } from "@/components/ui/Switch";

export function TipoAplicavelToggle({
  companyId,
  tipoId,
  aplicavel,
}: {
  companyId: string;
  tipoId: string;
  aplicavel: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-foreground/50">Aplicável a esta empresa</span>
      <Switch
        checked={aplicavel}
        disabled={pending}
        label="Aplicável a esta empresa"
        onChange={() => startTransition(() => alternarTipoAplicavel(companyId, tipoId, !aplicavel))}
      />
    </div>
  );
}
