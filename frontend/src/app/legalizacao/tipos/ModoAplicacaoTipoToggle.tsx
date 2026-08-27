"use client";

import { useTransition } from "react";
import { alternarModoAplicacaoTipo } from "@/lib/actions/legalizacao";
import { Switch } from "@/components/ui/Switch";

export function ModoAplicacaoTipoToggle({
  tipoId,
  aplicaATodas,
}: {
  tipoId: string;
  aplicaATodas: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-foreground/50">
        {aplicaATodas ? "Todas as empresas" : "Empresas selecionadas"}
      </span>
      <Switch
        checked={aplicaATodas}
        disabled={pending}
        label="Aplica a todas as empresas por padrão"
        onChange={() => startTransition(() => alternarModoAplicacaoTipo(tipoId, !aplicaATodas))}
      />
    </div>
  );
}
