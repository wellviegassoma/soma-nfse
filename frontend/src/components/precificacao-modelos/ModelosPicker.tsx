"use client";

import { useTransition } from "react";
import { importarModelo } from "@/lib/actions/precificacao-modelos";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { PrecificacaoModeloComContagem } from "@/lib/types";

export function ModelosPicker({
  companyId,
  basePath,
  modelos,
}: {
  companyId: string;
  basePath: string;
  modelos: PrecificacaoModeloComContagem[];
}) {
  const [pending, startTransition] = useTransition();

  if (modelos.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-foreground/50">
        Nenhum modelo disponível no momento — comece do zero em &quot;Insumos&quot; e &quot;Procedimentos&quot;.
      </Card>
    );
  }

  return (
    <Card className="divide-y divide-border overflow-hidden">
      {modelos.map((modelo) => (
        <div key={modelo.id} className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">{modelo.nome}</div>
            <div className="truncate text-xs text-foreground/50">
              {modelo.especialidade ? `${modelo.especialidade} · ` : ""}
              {modelo.totalInsumos} insumo(s) · {modelo.totalProcedimentos} procedimento(s)
            </div>
            {modelo.descricao && <div className="mt-1 text-xs text-foreground/50">{modelo.descricao}</div>}
          </div>
          <Button
            variant="secondary"
            size="md"
            disabled={pending}
            onClick={() => {
              if (
                !confirm(
                  `Importar "${modelo.nome}" pro catálogo desta empresa? Isso adiciona ${modelo.totalInsumos} insumo(s) e ${modelo.totalProcedimentos} procedimento(s) — não afeta o que já estiver cadastrado.`,
                )
              )
                return;
              startTransition(() => importarModelo(companyId, modelo.id, basePath));
            }}
          >
            Usar este modelo
          </Button>
        </div>
      ))}
    </Card>
  );
}
