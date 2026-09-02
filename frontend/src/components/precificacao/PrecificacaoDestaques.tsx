import { Card } from "@/components/ui/Card";
import { formatarMoeda, formatarPercentual } from "@/lib/formatters";
import type { ProcedimentoComMargem } from "./ProcedimentosTable";

// Melhor/pior por margem, entre os procedimentos ATIVOS — um procedimento
// desativado não deveria roubar o destaque de "melhor" nem alarmar como
// "pior" já que ninguém está vendendo ele.
export function PrecificacaoDestaques({ rows }: { rows: ProcedimentoComMargem[] }) {
  const ativos = rows.filter((r) => r.procedimento.ativo);
  if (ativos.length === 0) return null;

  const melhor = ativos.reduce((a, b) => (b.margemPct > a.margemPct ? b : a));
  const pior = ativos.reduce((a, b) => (b.margemPct < a.margemPct ? b : a));

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card className="border-l-4 border-l-success p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
          🏆 Melhor procedimento
        </div>
        <div className="mt-1 truncate text-base font-semibold text-foreground">
          {melhor.procedimento.nome}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-bold text-success">{formatarPercentual(melhor.margemPct)}</span>
          <span className="text-foreground/50">
            {formatarMoeda(melhor.procedimento.preco_venda)} · receita líquida{" "}
            {formatarMoeda(melhor.receitaLiquida)}
          </span>
        </div>
      </Card>
      <Card className="border-l-4 border-l-danger p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
          ⚠ Pior procedimento
        </div>
        <div className="mt-1 truncate text-base font-semibold text-foreground">
          {pior.procedimento.nome}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <span className={pior.margemPct < 0 ? "font-bold text-danger" : "font-bold text-warning"}>
            {formatarPercentual(pior.margemPct)}
          </span>
          <span className="text-foreground/50">
            {formatarMoeda(pior.procedimento.preco_venda)} · receita líquida{" "}
            {formatarMoeda(pior.receitaLiquida)}
          </span>
        </div>
      </Card>
    </div>
  );
}
