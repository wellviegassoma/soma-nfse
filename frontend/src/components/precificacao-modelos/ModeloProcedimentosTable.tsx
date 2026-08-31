"use client";

import { useTransition } from "react";
import Link from "next/link";
import { deleteModeloProcedimento } from "@/lib/actions/precificacao-modelos";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatarMoeda } from "@/lib/formatters";
import type { PrecificacaoModeloProcedimento } from "@/lib/types";

export function ModeloProcedimentosTable({
  modeloId,
  procedimentos,
}: {
  modeloId: string;
  procedimentos: PrecificacaoModeloProcedimento[];
}) {
  const [pending, startTransition] = useTransition();

  if (procedimentos.length === 0) {
    return <Card className="p-10 text-center text-sm text-foreground/50">Nenhum procedimento cadastrado ainda.</Card>;
  }

  return (
    <Card className="divide-y divide-border overflow-hidden">
      {procedimentos.map((procedimento) => (
        <div key={procedimento.id} className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">
              {procedimento.nome}
              {!procedimento.ativo && <span className="ml-2 text-xs font-normal text-foreground/40">(inativo)</span>}
            </div>
            <div className="truncate text-xs text-foreground/50">
              {procedimento.especialidade ? `${procedimento.especialidade} · ` : ""}
              {formatarMoeda(procedimento.preco_venda)} · {procedimento.tempo_atendimento_horas}h
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href={`/admin/precificacao-modelos/${modeloId}/procedimentos/${procedimento.id}`}>
              <Button variant="secondary" size="md">
                Editar
              </Button>
            </Link>
            <Button
              variant="danger"
              size="md"
              disabled={pending}
              onClick={() => startTransition(() => deleteModeloProcedimento(modeloId, procedimento.id))}
            >
              Excluir
            </Button>
          </div>
        </div>
      ))}
    </Card>
  );
}
