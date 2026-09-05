"use client";

import { useActionState } from "react";
import { buscarAgora } from "@/lib/actions/fechamento";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { NotasDivergentesAlerta } from "@/components/fechamento/NotasDivergentesAlerta";

export function BuscarAgoraButton({
  companyId,
  competencia,
}: {
  companyId: string;
  competencia: string;
}) {
  const [state, formAction, pending] = useActionState(buscarAgora, undefined);
  const mesAtual = new Date().toISOString().slice(0, 7);
  const buscaHistorica = competencia !== mesAtual;

  return (
    <div className="flex flex-col gap-2">
      <form action={formAction}>
        <input type="hidden" name="companyId" value={companyId} />
        <input type="hidden" name="competencia" value={competencia} />
        <Button type="submit" variant="secondary" loading={pending}>
          Buscar agora ({competencia})
        </Button>
      </form>
      {buscaHistorica && (
        <p className="text-xs text-foreground/50">
          Competência passada — a busca escaneia desde o início e pode não achar tudo numa
          tentativa só para empresas com muito histórico. Clique de novo se faltar nota.
        </p>
      )}
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.resultado && (
        <Alert tone={state.resultado.status === "sucesso" ? "success" : "danger"}>
          {state.resultado.status === "sucesso" &&
            `Sincronizado agora — ${state.resultado.notas ?? 0} nota(s) processada(s), ${state.resultado.notasNovas ?? 0} nova(s).`}
          {state.resultado.status === "erro" && `Erro: ${state.resultado.erro}`}
          {state.resultado.status === "pulado" && `Não sincronizado: ${state.resultado.erro}`}
        </Alert>
      )}
      <NotasDivergentesAlerta notas={state?.resultado?.notasDivergentes} />
    </div>
  );
}
