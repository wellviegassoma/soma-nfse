"use client";

import { useActionState } from "react";
import Link from "next/link";
import { importarFechamentoXmlGlobal } from "@/lib/actions/fechamento";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";

export function ImportFechamentoGlobalForm() {
  const [state, formAction, pending] = useActionState(importarFechamentoXmlGlobal, undefined);

  return (
    <div className="flex flex-col gap-5">
      <form action={formAction} className="flex flex-col gap-4">
        {state?.error && <Alert tone="danger">{state.error}</Alert>}

        <Field
          label="Arquivos XML das notas (NFS-e ou DPS)"
          htmlFor="files"
          hint="Pode misturar notas de empresas diferentes no mesmo lote"
        >
          <Input id="files" name="files" type="file" accept=".xml" multiple required />
        </Field>

        <div className="flex items-center gap-3">
          <Button type="submit" loading={pending}>
            Importar
          </Button>
          <Link href="/admin/fechamento" className="text-sm font-medium text-foreground/60 hover:underline">
            Voltar
          </Link>
        </div>
      </form>

      {state?.resultado && (
        <div className="flex flex-col gap-3">
          <Alert tone={state.resultado.importados > 0 ? "success" : "warning"}>
            {state.resultado.importados} nota(s) importada(s). {state.resultado.ignorados} já
            existia(m) ou vinha(m) repetida(s) no lote.
          </Alert>
          {state.resultado.erros.length > 0 && (
            <div className="rounded-lg border border-border p-4">
              <div className="mb-2 text-sm font-medium text-foreground">
                Não deu pra importar {state.resultado.erros.length} arquivo(s):
              </div>
              <ul className="flex flex-col gap-1 text-xs text-foreground/60">
                {state.resultado.erros.map((e, i) => (
                  <li key={i}>
                    <span className="font-mono">{e.arquivo}</span> — {e.motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
