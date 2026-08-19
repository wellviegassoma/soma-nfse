"use client";

import { useActionState } from "react";
import Link from "next/link";
import { importarTomadoresXml } from "@/lib/actions/tomadores";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";

export function ImportTomadoresForm({ companyId }: { companyId: string }) {
  const [state, formAction, pending] = useActionState(importarTomadoresXml, undefined);

  return (
    <div className="flex flex-col gap-5">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="companyId" value={companyId} />

        {state?.error && <Alert tone="danger">{state.error}</Alert>}

        <Field
          label="Arquivos XML das notas já emitidas"
          htmlFor="files"
          hint="Pode selecionar vários de uma vez — cada um deve ser o XML de uma DPS ou NFS-e"
        >
          <Input id="files" name="files" type="file" accept=".xml" multiple required />
        </Field>

        <div className="flex items-center gap-3">
          <Button type="submit" loading={pending}>
            Importar
          </Button>
          <Link
            href={`/empresas/${companyId}/tomadores`}
            className="text-sm font-medium text-foreground/60 hover:underline"
          >
            Voltar
          </Link>
        </div>
      </form>

      {state?.resultado && (
        <div className="flex flex-col gap-3">
          <Alert tone={state.resultado.importados > 0 ? "success" : "warning"}>
            {state.resultado.importados} tomador(es) importado(s). {state.resultado.ignorados}{" "}
            já existia(m) ou vinha(m) repetido(s) no lote.
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
