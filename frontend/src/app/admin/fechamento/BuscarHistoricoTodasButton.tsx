"use client";

import { useActionState } from "react";
import { buscarHistoricoTodasAgora } from "@/lib/actions/fechamento";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export function BuscarHistoricoTodasButton() {
  const [state, formAction, pending] = useActionState(buscarHistoricoTodasAgora, undefined);

  const sucessos = state?.resultados?.filter((r) => r.status === "sucesso").length ?? 0;
  const erros = state?.resultados?.filter((r) => r.status === "erro").length ?? 0;
  const totalNotas = state?.resultados?.reduce((acc, r) => acc + (r.notas ?? 0), 0) ?? 0;

  return (
    <div className="flex flex-col items-end gap-2">
      <form action={formAction}>
        <Button type="submit" variant="secondary" loading={pending}>
          Buscar últimos 12 meses (todas)
        </Button>
      </form>
      <p className="max-w-[240px] text-right text-xs text-foreground/50">
        Escaneia o histórico completo de cada empresa com certificado. Pode demorar vários
        minutos.
      </p>
      {state?.resultados && (
        <Alert tone={erros === 0 ? "success" : "warning"}>
          {sucessos} empresa(s) sincronizada(s) ({totalNotas} nota(s) no total)
          {erros > 0 ? `, ${erros} com erro` : ""}.
        </Alert>
      )}
    </div>
  );
}
