"use client";

import { useState, useTransition } from "react";
import { arquivarProspect, desarquivarProspect, excluirProspectPermanente } from "@/lib/actions/comercial";
import { Button } from "@/components/ui/Button";

export function ArquivarExcluirProspect({
  prospectId,
  arquivado,
}: {
  prospectId: string;
  arquivado: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (confirmandoExclusao) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-foreground/70">
          Excluir de vez? Apaga checklist, anexos e histórico — não dá pra desfazer.
        </span>
        <Button
          type="button"
          variant="danger"
          size="md"
          className="h-8 px-3 text-xs"
          loading={pending}
          onClick={() => startTransition(() => excluirProspectPermanente(prospectId))}
        >
          Sim, excluir de vez
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="md"
          className="h-8 px-3 text-xs"
          disabled={pending}
          onClick={() => setConfirmandoExclusao(false)}
        >
          Cancelar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {error && <span className="text-xs text-danger">{error}</span>}
      <Button
        type="button"
        variant="secondary"
        loading={pending}
        onClick={() =>
          startTransition(() => {
            setError(null);
            const acao = arquivado ? desarquivarProspect : arquivarProspect;
            acao(prospectId).catch(() => setError("Não foi possível concluir a ação."));
          })
        }
      >
        {arquivado ? "Desarquivar" : "Arquivar"}
      </Button>
      <button
        type="button"
        className="text-xs text-danger underline"
        onClick={() => setConfirmandoExclusao(true)}
      >
        Excluir permanentemente
      </button>
    </div>
  );
}
