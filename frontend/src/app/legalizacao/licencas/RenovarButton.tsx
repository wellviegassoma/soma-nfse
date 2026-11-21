"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { abrirRenovacao } from "@/lib/actions/legalizacao-renovacoes";

export function RenovarButton({ companyId, tipoId }: { companyId: string; tipoId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        className="rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
        onClick={() =>
          startTransition(async () => {
            setErro(null);
            const r = await abrirRenovacao(companyId, tipoId);
            if ("processoId" in r) router.push(`/legalizacao/processos/${r.processoId}`);
            else if (r.processoExistenteId) router.push(`/legalizacao/processos/${r.processoExistenteId}`);
            else setErro(r.error);
          })
        }
      >
        {pending ? "Abrindo…" : "Renovar"}
      </button>
      {erro && <span className="mt-1 max-w-40 text-right text-[11px] text-danger">{erro}</span>}
    </span>
  );
}
