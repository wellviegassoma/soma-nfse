"use client";

import { useActionState } from "react";
import { buscarAgora } from "@/lib/actions/fechamento";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export function BuscarAgoraButton({ companyId }: { companyId: string }) {
  const [state, formAction, pending] = useActionState(buscarAgora, undefined);

  return (
    <div className="flex flex-col gap-2">
      <form action={formAction}>
        <input type="hidden" name="companyId" value={companyId} />
        <Button type="submit" variant="secondary" loading={pending}>
          Buscar agora
        </Button>
      </form>
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.resultado && (
        <Alert tone={state.resultado.status === "sucesso" ? "success" : "danger"}>
          {state.resultado.status === "sucesso" &&
            `Sincronizado agora — ${state.resultado.notas ?? 0} nota(s) processada(s).`}
          {state.resultado.status === "erro" && `Erro: ${state.resultado.erro}`}
          {state.resultado.status === "pulado" && `Não sincronizado: ${state.resultado.erro}`}
        </Alert>
      )}
    </div>
  );
}
