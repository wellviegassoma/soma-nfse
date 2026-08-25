"use client";

import { useActionState, useState } from "react";
import { importarFolhaAnalitica, salvarFolhaAnaliticaImportada } from "@/lib/actions/folha";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";

function formatCompetencia(competencia: string) {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

type Revisao = {
  competenciaProLabore: string;
  competenciaSalariosFgts: string;
  proLabore: string;
  salarios: string;
  fgts: string;
};

export function ImportarFolhaAnaliticaForm({ companyId }: { companyId: string }) {
  const [importState, importAction, importPending] = useActionState(importarFolhaAnalitica, undefined);
  const [revisao, setRevisao] = useState<Revisao | null>(null);
  const [saveState, saveAction, savePending] = useActionState(salvarFolhaAnaliticaImportada, undefined);

  // Ajusta o estado local (revisão) em resposta a um novo resultado de
  // action, direto durante o render — evita o useEffect+setState.
  const [importStateVisto, setImportStateVisto] = useState(importState);
  if (importState !== importStateVisto) {
    setImportStateVisto(importState);
    if (importState?.resultado) {
      const r = importState.resultado;
      setRevisao({
        competenciaProLabore: r.competenciaProLabore,
        competenciaSalariosFgts: r.competenciaSalariosFgts,
        proLabore: r.proLabore != null ? String(r.proLabore) : "",
        salarios: r.salarios != null ? String(r.salarios) : "",
        fgts: r.fgts != null ? String(r.fgts) : "",
      });
    }
  }
  const [saveStateVisto, setSaveStateVisto] = useState(saveState);
  if (saveState !== saveStateVisto) {
    setSaveStateVisto(saveState);
    if (saveState?.success) setRevisao(null);
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <div>
        <div className="text-sm font-semibold text-foreground/70">Importar folha de pagamento</div>
        <p className="text-xs text-foreground/50">
          Sobe o PDF da folha analítica de um mês — separa pró-labore de salários e já lança cada
          um na competência certa pro Fator R (pró-labore no mês da própria folha; salários e FGTS
          no mês seguinte, quando são efetivamente pagos/recolhidos). Confira sempre antes de
          salvar (o layout desse relatório varia mais que o do PGDAS-D).
        </p>
      </div>

      {!revisao && (
        <form action={importAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="companyId" value={companyId} />
          <input type="file" name="arquivo" accept="application/pdf" required className="text-sm" />
          <Button type="submit" variant="secondary" loading={importPending}>
            Ler PDF
          </Button>
        </form>
      )}
      {importState?.error && <Alert tone="danger">{importState.error}</Alert>}
      {importState?.resultado?.motivo && <Alert tone="warning">{importState.resultado.motivo}</Alert>}

      {revisao && (
        <form action={saveAction} className="flex flex-col gap-4">
          <input type="hidden" name="companyId" value={companyId} />
          <input type="hidden" name="competenciaProLabore" value={revisao.competenciaProLabore} />
          <input
            type="hidden"
            name="competenciaSalariosFgts"
            value={revisao.competenciaSalariosFgts}
          />

          <div className="flex flex-wrap items-end gap-3">
            <div className="w-[220px]">
              <Field
                label={`Pró-labore — ${formatCompetencia(revisao.competenciaProLabore)}`}
                htmlFor="proLabore"
              >
                <Input
                  id="proLabore"
                  name="proLabore"
                  type="number"
                  step="0.01"
                  min={0}
                  value={revisao.proLabore}
                  onChange={(e) => setRevisao((r) => ({ ...r!, proLabore: e.target.value }))}
                  required
                />
              </Field>
            </div>
            <div className="w-[220px]">
              <Field
                label={`Salários — ${formatCompetencia(revisao.competenciaSalariosFgts)}`}
                htmlFor="salarios"
              >
                <Input
                  id="salarios"
                  name="salarios"
                  type="number"
                  step="0.01"
                  min={0}
                  value={revisao.salarios}
                  onChange={(e) => setRevisao((r) => ({ ...r!, salarios: e.target.value }))}
                  required
                />
              </Field>
            </div>
            <div className="w-[220px]">
              <Field
                label={`FGTS — ${formatCompetencia(revisao.competenciaSalariosFgts)}`}
                htmlFor="fgts"
              >
                <Input
                  id="fgts"
                  name="fgts"
                  type="number"
                  step="0.01"
                  min={0}
                  value={revisao.fgts}
                  onChange={(e) => setRevisao((r) => ({ ...r!, fgts: e.target.value }))}
                  required
                />
              </Field>
            </div>
          </div>

          <div className="flex gap-3">
            <Button type="submit" loading={savePending}>
              Confirmar e salvar
            </Button>
            <Button type="button" variant="secondary" onClick={() => setRevisao(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
      {saveState?.error && <Alert tone="danger">{saveState.error}</Alert>}
      {saveState?.success && <Alert tone="success">Pró-labore, salários e FGTS salvos.</Alert>}
    </div>
  );
}
