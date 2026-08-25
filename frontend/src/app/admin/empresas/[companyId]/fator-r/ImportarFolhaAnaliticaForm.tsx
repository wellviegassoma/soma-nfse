"use client";

import { useActionState, useState } from "react";
import { importarFolhaAnalitica, salvarFolhaMensal } from "@/lib/actions/folha";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";

function formatCompetencia(competencia: string) {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

export function ImportarFolhaAnaliticaForm({ companyId }: { companyId: string }) {
  const [importState, importAction, importPending] = useActionState(importarFolhaAnalitica, undefined);
  const [revisao, setRevisao] = useState<{ competencia: string; valor: string; fgts: string } | null>(
    null,
  );
  const [saveState, saveAction, savePending] = useActionState(salvarFolhaMensal, undefined);

  // Ajusta o estado local (revisão) em resposta a um novo resultado de
  // action, direto durante o render — evita o useEffect+setState.
  const [importStateVisto, setImportStateVisto] = useState(importState);
  if (importState !== importStateVisto) {
    setImportStateVisto(importState);
    if (importState?.resultado) {
      setRevisao({
        competencia: importState.resultado.competencia,
        valor: importState.resultado.valor != null ? String(importState.resultado.valor) : "",
        fgts: importState.resultado.fgts != null ? String(importState.resultado.fgts) : "",
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
          Sobe o PDF da folha analítica de um mês — o sistema tenta identificar o total, mas
          confira sempre antes de salvar (o layout desse relatório varia mais que o do PGDAS-D).
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
        <form action={saveAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="companyId" value={companyId} />
          <input type="hidden" name="competencia" value={revisao.competencia} />
          <div className="text-sm text-foreground/70">
            Competência: <span className="font-medium text-foreground">{formatCompetencia(revisao.competencia)}</span>
          </div>
          <div className="w-[200px]">
            <Field label="Folha do mês (R$)" htmlFor="valor">
              <Input
                id="valor"
                name="valor"
                type="number"
                step="0.01"
                min={0}
                value={revisao.valor}
                onChange={(e) => setRevisao((r) => ({ ...r!, valor: e.target.value }))}
                required
              />
            </Field>
          </div>
          <div className="w-[200px]">
            <Field label="FGTS do mês (R$)" htmlFor="fgts">
              <Input
                id="fgts"
                name="fgts"
                type="number"
                step="0.01"
                min={0}
                value={revisao.fgts}
                onChange={(e) => setRevisao((r) => ({ ...r!, fgts: e.target.value }))}
              />
            </Field>
          </div>
          <Button type="submit" loading={savePending}>
            Confirmar e salvar
          </Button>
          <Button type="button" variant="secondary" onClick={() => setRevisao(null)}>
            Cancelar
          </Button>
        </form>
      )}
      {saveState?.error && <Alert tone="danger">{saveState.error}</Alert>}
      {saveState?.success && <Alert tone="success">Folha do mês salva.</Alert>}
    </div>
  );
}
