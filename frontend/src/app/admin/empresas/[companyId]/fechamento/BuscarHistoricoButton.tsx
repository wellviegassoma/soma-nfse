"use client";

import { useActionState } from "react";
import { buscarHistoricoAgora } from "@/lib/actions/fechamento";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { NotasDivergentesAlerta } from "@/components/fechamento/NotasDivergentesAlerta";

export function BuscarHistoricoButton({ companyId }: { companyId: string }) {
  const [state, formAction, pending] = useActionState(buscarHistoricoAgora, undefined);

  return (
    <div className="flex flex-col gap-2">
      <form action={formAction}>
        <input type="hidden" name="companyId" value={companyId} />
        <Button type="submit" variant="secondary" loading={pending}>
          Buscar últimos 12 meses
        </Button>
      </form>
      <p className="text-xs text-foreground/50">
        Escaneia desde o início — pode demorar alguns minutos. Pode não achar tudo numa tentativa
        só pra empresa com muito histórico; clique de novo se faltar nota.
      </p>
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.resultado && (
        <Alert tone={state.resultado.status === "sucesso" ? "success" : "danger"}>
          {state.resultado.status === "sucesso" &&
            `Sincronizado — ${state.resultado.notas ?? 0} nota(s) processada(s) nos últimos 12 meses, ${state.resultado.notasNovas ?? 0} nova(s).`}
          {state.resultado.status === "erro" && `Erro: ${state.resultado.erro}`}
          {state.resultado.status === "pulado" && `Não sincronizado: ${state.resultado.erro}`}
        </Alert>
      )}
      <NotasDivergentesAlerta notas={state?.resultado?.notasDivergentes} />
    </div>
  );
}
