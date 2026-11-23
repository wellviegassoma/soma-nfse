"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { abrirExercicioAction } from "@/lib/actions/irpf";

export function AbrirExercicioButton({ exercicio, faltam }: { exercicio: number; faltam: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <Button
        loading={pending}
        onClick={() => {
          if (!confirm(`Criar a declaração ${exercicio} (Não iniciada, com checklist) para ${faltam} contribuinte(s) ativo(s)?`)) return;
          start(async () => {
            const r = await abrirExercicioAction(exercicio);
            setMsg("error" in r ? r.error : `${r.criadas} declaração(ões) criada(s).`);
          });
        }}
      >
        Abrir exercício {exercicio} ({faltam})
      </Button>
      {msg && <span className="text-xs text-foreground/60">{msg}</span>}
    </div>
  );
}
