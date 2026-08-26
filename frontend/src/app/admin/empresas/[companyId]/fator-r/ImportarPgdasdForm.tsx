"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { importarPgdasd, salvarFolhaMensalLote } from "@/lib/actions/folha";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatCompetencia(competencia: string) {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

export function ImportarPgdasdForm({ companyId }: { companyId: string }) {
  const [importState, importAction, importPending] = useActionState(importarPgdasd, undefined);
  const [linhas, setLinhas] = useState<{ competencia: string; valor: number }[] | null>(null);
  const [saveState, saveAction, savePending] = useActionState(salvarFolhaMensalLote, undefined);

  // Ajusta o estado local (tabela de revisão) em resposta a um novo
  // resultado de action, direto durante o render — evita o
  // useEffect+setState (renderização em cascata desnecessária).
  const [importStateVisto, setImportStateVisto] = useState(importState);
  if (importState !== importStateVisto) {
    setImportStateVisto(importState);
    if (importState?.resultado) setLinhas(importState.resultado.folhaMensal);
  }
  const [saveStateVisto, setSaveStateVisto] = useState(saveState);
  if (saveState !== saveStateVisto) {
    setSaveStateVisto(saveState);
    if (saveState?.success) setLinhas(null);
  }

  const resultado = importState?.resultado;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <div>
        <div className="text-sm font-semibold text-foreground/70">Importar do PGDAS-D</div>
        <p className="text-xs text-foreground/50">
          Sobe o PDF da declaração (PGDASD-DECLARACAO.pdf) — traz até 12 meses de folha de uma vez,
          direto da seção oficial usada no cálculo do Fator R.
        </p>
      </div>

      {!linhas && (
        <form action={importAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="companyId" value={companyId} />
          <input type="file" name="arquivo" accept="application/pdf" required className="text-sm" />
          <Button type="submit" variant="secondary" loading={importPending}>
            Ler PDF
          </Button>
        </form>
      )}
      {importState?.error && <Alert tone="danger">{importState.error}</Alert>}

      {linhas && (
        <form action={saveAction} className="flex flex-col gap-3">
          <input type="hidden" name="companyId" value={companyId} />
          <input type="hidden" name="linhas" value={JSON.stringify(linhas)} />

          {resultado?.rbt12 != null && (
            <p className="text-xs text-foreground/50">
              RBT12 declarado nessa competência ({formatCompetencia(resultado.competenciaPA)}):{" "}
              {formatMoney(resultado.rbt12)}. O PGDAS-D não traz o faturamento mês a mês, então
              esse total não é aplicado automaticamente — pra completar competências anteriores à
              empresa no sistema, informe o faturamento de cada mês na aba{" "}
              <Link href={`/admin/empresas/${companyId}/rbt12`} className="underline">
                RBT12
              </Link>
              .
            </p>
          )}

          <div className="overflow-hidden rounded border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-xs text-foreground/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Competência</th>
                  <th className="px-3 py-2 text-left font-medium">Folha (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {linhas.map((linha, i) => (
                  <tr key={linha.competencia}>
                    <td className="px-3 py-2">{formatCompetencia(linha.competencia)}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={linha.valor}
                        onChange={(e) => {
                          const novoValor = Number(e.target.value);
                          setLinhas((prev) =>
                            prev!.map((l, idx) => (idx === i ? { ...l, valor: novoValor } : l)),
                          );
                        }}
                        className="w-32 rounded border border-border bg-surface px-2 py-1"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <Button type="submit" loading={savePending}>
              Confirmar e salvar {linhas.length} mês(es)
            </Button>
            <Button type="button" variant="secondary" onClick={() => setLinhas(null)}>
              Cancelar
            </Button>
          </div>
          {saveState?.error && <Alert tone="danger">{saveState.error}</Alert>}
        </form>
      )}
      {saveState?.success && (
        <Alert tone="success">{saveState.salvos} mês(es) de folha salvos.</Alert>
      )}
    </div>
  );
}
