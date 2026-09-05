import { formatarMoeda } from "@/lib/formatters";
import type { NotaDivergente } from "@/lib/sync-notas";

export function NotasDivergentesAlerta({
  notas,
  comEmpresa = false,
}: {
  notas?: (NotaDivergente & { empresaNome?: string })[];
  comEmpresa?: boolean;
}) {
  if (!notas || notas.length === 0) return null;

  return (
    <div className="rounded-lg border border-warning/30 bg-warning-soft/40 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-warning">
        Notas novas com competência divergente da emissão — {notas.length}
      </div>
      <p className="mt-1 text-xs text-foreground/60">
        A competência informada na nota não bate com o mês/ano da data de emissão real — pode
        gerar imposto retroativo num período que já foi fechado.
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-foreground/50">
              {comEmpresa && <th className="pr-4 py-1 font-medium">Empresa</th>}
              <th className="pr-4 py-1 font-medium">Nota</th>
              <th className="pr-4 py-1 font-medium">Emitida em</th>
              <th className="pr-4 py-1 font-medium">Competência informada</th>
              <th className="pr-4 py-1 font-medium">Valor</th>
              <th className="pr-4 py-1 font-medium">Tomador/Prestador</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {notas.map((d, i) => (
              <tr key={i}>
                {comEmpresa && <td className="pr-4 py-1.5">{d.empresaNome}</td>}
                <td className="pr-4 py-1.5">{d.numero ?? "—"}</td>
                <td className="pr-4 py-1.5">
                  {d.dataEmissao ? new Date(d.dataEmissao).toLocaleDateString("pt-BR") : "—"}
                </td>
                <td className="pr-4 py-1.5">{d.competencia ?? "—"}</td>
                <td className="pr-4 py-1.5">
                  {d.valorServico != null ? formatarMoeda(d.valorServico) : "—"}
                </td>
                <td className="pr-4 py-1.5">{d.tomadorNome || d.prestadorNome || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
