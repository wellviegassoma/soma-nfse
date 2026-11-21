"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { concluirFase } from "@/lib/actions/legalizacao-processos";

export function ConcluirEtapaButton({
  faseId,
  processoId,
  hoje,
}: {
  faseId: string;
  processoId: string;
  hoje: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        className="rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-medium text-foreground hover:bg-surface-muted disabled:opacity-50"
        onClick={() =>
          startTransition(async () => {
            setErro(null);
            const r = await concluirFase(faseId, processoId, hoje);
            if (r && "redirectTo" in r && r.redirectTo) router.push(r.redirectTo);
            else if (r && "error" in r) setErro(r.error);
          })
        }
      >
        {pending ? "Concluindo…" : "Concluir etapa →"}
      </button>
      {erro && <span className="text-[11px] text-danger">{erro}</span>}
    </div>
  );
}
