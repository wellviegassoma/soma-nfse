import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { formatarMoeda, formatarPercentual } from "@/lib/formatters";
import type { PrecificacaoProcedimento } from "@/lib/types";

export type ProcedimentoComMargem = {
  procedimento: PrecificacaoProcedimento;
  margemPct: number;
  receitaLiquida: number;
};

// Limiares só pra sinalização visual — não são regra de negócio.
function tomMargem(margemPct: number): { className: string; label?: string } {
  if (margemPct < 0) return { className: "bg-danger-soft text-danger", label: "prejuízo" };
  if (margemPct < 0.15) return { className: "bg-warning-soft text-warning" };
  return { className: "bg-success-soft text-success" };
}

export function ProcedimentosTable({
  basePath,
  rows,
}: {
  basePath: string;
  rows: ProcedimentoComMargem[];
}) {
  if (rows.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-foreground/50">
        Nenhum procedimento cadastrado ainda.
      </Card>
    );
  }

  return (
    <Card className="divide-y divide-border overflow-hidden">
      {rows.map(({ procedimento, margemPct, receitaLiquida }) => {
        const tom = tomMargem(margemPct);
        return (
          <Link
            key={procedimento.id}
            href={`${basePath}/procedimentos/${procedimento.id}`}
            className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-muted"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">
                {procedimento.nome}
                {!procedimento.ativo && (
                  <span className="ml-2 text-xs font-normal text-foreground/40">(inativo)</span>
                )}
              </div>
              <div className="truncate text-xs text-foreground/50">
                {procedimento.especialidade ? `${procedimento.especialidade} · ` : ""}
                {formatarMoeda(procedimento.preco_venda)} · receita líquida {formatarMoeda(receitaLiquida)}
              </div>
            </div>
            <span className={cn("shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", tom.className)}>
              {formatarPercentual(margemPct)}
              {tom.label ? ` · ${tom.label}` : ""}
            </span>
          </Link>
        );
      })}
    </Card>
  );
}
