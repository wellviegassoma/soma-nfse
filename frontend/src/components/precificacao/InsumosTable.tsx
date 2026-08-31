"use client";

import { useTransition } from "react";
import Link from "next/link";
import { deleteInsumo } from "@/lib/actions/precificacao";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatarMoeda } from "@/lib/formatters";
import { calcularCustoPorUso } from "@/lib/precificacao/engine";
import type { PrecificacaoInsumo } from "@/lib/types";

export function InsumosTable({
  companyId,
  basePath,
  insumos,
}: {
  companyId: string;
  basePath: string;
  insumos: PrecificacaoInsumo[];
}) {
  const [pending, startTransition] = useTransition();

  if (insumos.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-foreground/50">
        Nenhum insumo cadastrado ainda.
      </Card>
    );
  }

  return (
    <Card className="divide-y divide-border overflow-hidden">
      {insumos.map((insumo) => {
        const custoPorUso = calcularCustoPorUso(insumo);
        return (
          <div key={insumo.id} className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{insumo.nome}</div>
              <div className="truncate text-xs text-foreground/50">
                {insumo.unidade_compra ? `${insumo.unidade_compra} · ` : ""}
                {formatarMoeda(insumo.valor_compra)} / {insumo.quantidade_por_compra} uso(s) ·{" "}
                custo por uso {formatarMoeda(custoPorUso)}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link href={`${basePath}/insumos/${insumo.id}`}>
                <Button variant="secondary" size="md">
                  Editar
                </Button>
              </Link>
              <Button
                variant="danger"
                size="md"
                disabled={pending}
                onClick={() => startTransition(() => deleteInsumo(companyId, insumo.id))}
              >
                Excluir
              </Button>
            </div>
          </div>
        );
      })}
    </Card>
  );
}
