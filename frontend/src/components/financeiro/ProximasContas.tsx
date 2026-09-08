import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { formatarBRL, formatarDataBr, type AgendamentoTipo } from "@/lib/financeiro";

export type ProximaConta = {
  id: string;
  descricao: string | null;
  contatoNome: string | null;
  data: string; // previsto_para ?? vencimento — a data que a lista usa pra ordenar
  emAberto: number;
  vencido: boolean;
};

/**
 * Bloco "Próximos a receber" / "Próximos a pagar" da tela inicial — mesmo
 * componente pros dois, só troca o sinal (cor, rótulo, link). É a mesma
 * lista de qualquer jeito: data, contato, valor em aberto.
 */
export function ProximasContas({
  titulo,
  tipo,
  href,
  itens,
  totalEmAberto,
  totalVencido,
}: {
  titulo: string;
  tipo: AgendamentoTipo;
  href: string;
  itens: ProximaConta[];
  totalEmAberto: number;
  totalVencido: number;
}) {
  const cor = tipo === "RECEBER" ? "text-success" : "text-danger";

  return (
    <Card className="flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
          <p className={`mt-0.5 text-lg font-semibold ${cor}`}>{formatarBRL(totalEmAberto)}</p>
        </div>
        {totalVencido > 0 && (
          <span className="shrink-0 rounded-full bg-danger-soft px-2.5 py-1 text-xs font-medium text-danger">
            {formatarBRL(totalVencido)} vencido
          </span>
        )}
      </div>

      {itens.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-foreground/55">
          Nada em aberto {tipo === "RECEBER" ? "para receber" : "para pagar"}.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {itens.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">
                  {c.contatoNome || c.descricao || "Sem descrição"}
                </p>
                <p className="text-xs text-foreground/50">
                  {c.contatoNome && c.descricao ? `${c.descricao} · ` : ""}
                  <span className={c.vencido ? "font-medium text-danger" : ""}>
                    {c.vencido ? "venceu " : "vence "}
                    {formatarDataBr(c.data)}
                  </span>
                </p>
              </div>
              <span className="shrink-0 text-sm font-medium text-foreground">
                {formatarBRL(c.emAberto)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Link
        href={href}
        className="mt-auto border-t border-border px-5 py-3 text-center text-sm font-medium text-brand hover:bg-surface-muted"
      >
        Ver tudo
      </Link>
    </Card>
  );
}
