"use client";

import { useActionState } from "react";
import Link from "next/link";
import { importarEmpresasPlanilha } from "@/lib/actions/empresas";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";

export function ImportCompaniesForm() {
  const [state, formAction, pending] = useActionState(importarEmpresasPlanilha, undefined);

  return (
    <div className="flex flex-col gap-5">
      <form action={formAction} className="flex flex-col gap-4">
        {state?.error && <Alert tone="danger">{state.error}</Alert>}

        <Field
          label="Planilha (.xlsx, .xls ou .csv)"
          htmlFor="file"
          hint='Colunas esperadas: "nome" (ou "razão social") e "cnpj" OU "cpf" — nessa ordem ou não, tanto faz'
        >
          <Input id="file" name="file" type="file" accept=".xlsx,.xls,.csv" required />
        </Field>

        <div className="flex items-center gap-3">
          <Button type="submit" loading={pending}>
            Importar
          </Button>
          <Link
            href="/admin/empresas"
            className="text-sm font-medium text-foreground/60 hover:underline"
          >
            Voltar
          </Link>
        </div>
      </form>

      {state?.resultado && (
        <div className="flex flex-col gap-3">
          <Alert tone={state.resultado.importadas > 0 ? "success" : "warning"}>
            {state.resultado.importadas} empresa(s) importada(s). {state.resultado.ignoradas} já
            existia(m) ou vinha(m) repetida(s) na planilha.
          </Alert>
          {state.resultado.erros.length > 0 && (
            <div className="rounded-lg border border-border p-4">
              <div className="mb-2 text-sm font-medium text-foreground">
                Não deu pra importar {state.resultado.erros.length} linha(s):
              </div>
              <ul className="flex flex-col gap-1 text-xs text-foreground/60">
                {state.resultado.erros.map((e, i) => (
                  <li key={i}>
                    <span className="font-mono">{e.linha}</span> — {e.motivo}
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
