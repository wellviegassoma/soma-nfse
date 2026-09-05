"use client";

import { useActionState, useState } from "react";
import { inativarEmpresa, reativarEmpresa } from "@/lib/actions/empresas";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { STATUS_PILL_CLASSES } from "@/lib/formatters";
import { hojeBrasilia } from "@/lib/competencia";

export function StatusSomaForm({
  companyId,
  ativa,
  dataEncerramentoSoma,
}: {
  companyId: string;
  ativa: boolean;
  dataEncerramentoSoma: string | null;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [inativarState, inativarAction, inativarPending] = useActionState(
    inativarEmpresa,
    undefined,
  );
  const [reativarState, reativarAction, reativarPending] = useActionState(
    reativarEmpresa,
    undefined,
  );

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-foreground/70">Status na SOMA</h2>

      <div className="flex items-center gap-3">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            ativa ? STATUS_PILL_CLASSES.success : STATUS_PILL_CLASSES.neutral
          }`}
        >
          {ativa ? "Ativa" : "Inativa"}
        </span>
        {!ativa && dataEncerramentoSoma && (
          <span className="text-xs text-foreground/50">
            Encerrada com a SOMA em {dataEncerramentoSoma.split("-").reverse().join("/")}
          </span>
        )}
      </div>

      {inativarState?.error && <Alert tone="danger">{inativarState.error}</Alert>}
      {reativarState?.error && <Alert tone="danger">{reativarState.error}</Alert>}

      {ativa ? (
        confirmando ? (
          <form action={inativarAction} className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <input type="hidden" name="companyId" value={companyId} />
            <Alert tone="warning">
              Empresa inativa some das centrais de fechamento e das listagens, e para de buscar
              notas automaticamente. O cadastro e o histórico continuam intactos — dá pra reativar
              a qualquer momento.
            </Alert>
            <div className="w-[200px]">
              <Field label="Data de encerramento com a SOMA" htmlFor="dataEncerramentoSoma">
                <Input
                  id="dataEncerramentoSoma"
                  name="dataEncerramentoSoma"
                  type="date"
                  defaultValue={hojeBrasilia()}
                  required
                />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="danger" loading={inativarPending}>
                Confirmar inativação
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirmando(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <div>
            <Button type="button" variant="secondary" onClick={() => setConfirmando(true)}>
              Inativar empresa
            </Button>
          </div>
        )
      ) : (
        <form action={reativarAction}>
          <input type="hidden" name="companyId" value={companyId} />
          <Button type="submit" variant="secondary" loading={reativarPending}>
            Reativar empresa
          </Button>
        </form>
      )}
    </div>
  );
}
