"use client";

import { useActionState, useEffect, useRef } from "react";
import { criarTransferencia } from "@/lib/actions/financeiro-lancamentos";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";

export function TransferenciaForm({
  companyId,
  contas,
}: {
  companyId: string;
  contas: { id: string; banco: string; agencia: string; conta: string }[];
}) {
  const [state, formAction, pending] = useActionState(criarTransferencia, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  // Data local, não UTC — ver comentário em BaixaForm.
  const hoje = new Date().toLocaleDateString("en-CA");

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  if (contas.length < 2) {
    return (
      <p className="text-sm text-foreground/55">
        Transferência precisa de pelo menos duas contas cadastradas no módulo Extratos.
      </p>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <input type="hidden" name="companyId" value={companyId} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="De" htmlFor="contaOrigemId">
          <Select id="contaOrigemId" name="contaOrigemId" required defaultValue={contas[0].id}>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.banco} · {c.agencia}/{c.conta}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Para" htmlFor="contaDestinoId">
          <Select id="contaDestinoId" name="contaDestinoId" required defaultValue={contas[1].id}>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.banco} · {c.agencia}/{c.conta}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Data" htmlFor="dataTransf">
          <Input id="dataTransf" name="data" type="date" required defaultValue={hoje} />
        </Field>
        <Field label="Valor" htmlFor="valorTransf">
          <Input
            id="valorTransf"
            name="valor"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="0,00"
          />
        </Field>
      </div>
      <Field label="Descrição" htmlFor="descricaoTransf">
        <Input id="descricaoTransf" name="descricao" placeholder="Opcional" />
      </Field>
      <div>
        <Button type="submit" loading={pending}>
          Registrar transferência
        </Button>
      </div>
    </form>
  );
}
