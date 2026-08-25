"use client";

import { useActionState } from "react";
import { buscarTodasAgora } from "@/lib/actions/fechamento";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export function BuscarTodasButton() {
  const [state, formAction, pending] = useActionState(buscarTodasAgora, undefined);

  const sucessos = state?.resultados?.filter((r) => r.status === "sucesso").length ?? 0;
  const erros = state?.resultados?.filter((r) => r.status === "erro").length ?? 0;
  const totalNotas =
    state?.resultados?.reduce((acc, r) => acc + (r.notas ?? 0), 0) ?? 0;

  return (
    <div className="flex flex-col gap-2">
      <form action={formAction}>
        <Button type="submit" loading={pending}>
          Buscar todas agora
        </Button>
      </form>
      {state?.resultados && (
        <Alert tone={erros === 0 ? "success" : "warning"}>
          {sucessos} empresa(s) sincronizada(s) ({totalNotas} nota(s) no total)
          {erros > 0 ? `, ${erros} com erro` : ""}.
        </Alert>
      )}
    </div>
  );
}
