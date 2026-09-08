"use client";

import { useActionState, useEffect, useRef } from "react";
import { criarCategoria } from "@/lib/actions/financeiro";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { CATEGORIA_GRUPOS, CATEGORIA_GRUPO_LABELS } from "@/lib/financeiro";

export function CategoriaForm({ companyId }: { companyId: string }) {
  const [state, formAction, pending] = useActionState(criarCategoria, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <input type="hidden" name="companyId" value={companyId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Grupo" htmlFor="grupo">
          <Select id="grupo" name="grupo" required defaultValue="CUSTO_DESPESA_OPERACIONAL">
            {CATEGORIA_GRUPOS.map((g) => (
              <option key={g} value={g}>
                {CATEGORIA_GRUPO_LABELS[g]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nome" htmlFor="nome">
          <Input id="nome" name="nome" required placeholder="Ex.: Software e assinaturas" />
        </Field>
        <Field label="Natureza" htmlFor="natureza">
          <Select id="natureza" name="natureza" required defaultValue="SAIDA">
            <option value="ENTRADA">Entrada</option>
            <option value="SAIDA">Saída</option>
          </Select>
        </Field>
        <Field
          label="Conta contábil"
          htmlFor="contaContabil"
          hint="Opcional. Preenchida, o lançamento gerencial já nasce classificado pra contabilidade."
        >
          <Input id="contaContabil" name="contaContabil" placeholder="Opcional" />
        </Field>
      </div>

      <div>
        <Button type="submit" loading={pending}>
          Adicionar categoria
        </Button>
      </div>
    </form>
  );
}
