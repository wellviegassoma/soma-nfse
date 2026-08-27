"use client";

import { useTransition } from "react";
import { alternarTipoAplicavel } from "@/lib/actions/legalizacao";

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
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => alternarTipoAplicavel(companyId, tipoId, !aplicavel))}
      className="text-xs text-brand underline disabled:opacity-40"
    >
      {aplicavel ? "Marcar como não aplicável" : "Marcar como aplicável"}
    </button>
  );
}
