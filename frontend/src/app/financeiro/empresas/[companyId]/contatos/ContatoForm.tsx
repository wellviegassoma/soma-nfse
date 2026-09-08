"use client";

import { useActionState, useEffect, useRef } from "react";
import { criarContato } from "@/lib/actions/financeiro";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { CONTATO_TIPOS, CONTATO_TIPO_LABELS } from "@/lib/financeiro";

export function ContatoForm({ companyId }: { companyId: string }) {
  const [state, formAction, pending] = useActionState(criarContato, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <input type="hidden" name="companyId" value={companyId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo" htmlFor="tipo">
          <Select id="tipo" name="tipo" required defaultValue="FORNECEDOR">
            {CONTATO_TIPOS.map((t) => (
              <option key={t} value={t}>
                {CONTATO_TIPO_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nome" htmlFor="nome">
          <Input id="nome" name="nome" required placeholder="Nome ou razão social" />
        </Field>
        <Field label="CPF / CNPJ" htmlFor="cpfCnpj">
          <Input id="cpfCnpj" name="cpfCnpj" placeholder="Opcional" />
        </Field>
        <Field label="Telefone" htmlFor="telefone">
          <Input id="telefone" name="telefone" placeholder="Opcional" />
        </Field>
        <Field label="E-mail" htmlFor="email">
          <Input id="email" name="email" type="email" placeholder="Opcional" />
        </Field>
        <Field label="Observações" htmlFor="observacoes">
          <Input id="observacoes" name="observacoes" placeholder="Opcional" />
        </Field>
      </div>

      <div>
        <Button type="submit" loading={pending}>
          Adicionar contato
        </Button>
      </div>
    </form>
  );
}
