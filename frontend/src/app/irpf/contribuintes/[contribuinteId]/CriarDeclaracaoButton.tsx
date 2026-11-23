"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarDeclaracaoAction } from "@/lib/actions/irpf";

export function CriarDeclaracaoButton({ contribuinteId, exercicio }: { contribuinteId: string; exercicio: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-xs text-brand hover:underline disabled:opacity-50"
      onClick={() =>
        start(async () => {
          const r = await criarDeclaracaoAction({ contribuinteId, exercicio });
          if ("error" in r) alert(r.error);
          else router.push(`/irpf/declaracoes/${r.id}`);
        })
      }
    >
      {pending ? "Criando…" : `Criar declaração ${exercicio}`}
    </button>
  );
}
