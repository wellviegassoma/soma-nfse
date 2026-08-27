"use client";

import { useActionState, useRef, useEffect } from "react";
import { criarContaBancaria } from "@/lib/actions/extratos";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { SelecionarBancoInput } from "./SelecionarBancoInput";

export function ContaBancariaForm({ companyId }: { companyId: string }) {
  const [state, formAction, pending] = useActionState(criarContaBancaria, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state?.success]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="companyId" value={companyId} />
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <SelecionarBancoInput />
        <Field label="Agência" htmlFor="agencia">
          <Input id="agencia" name="agencia" required />
        </Field>
        <Field label="Conta" htmlFor="conta">
          <Input id="conta" name="conta" required />
        </Field>
        <div className="flex items-end">
          <Button type="submit" loading={pending}>
            + Adicionar conta
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Field label="Início do controle" htmlFor="dataInicioControle" hint="Opcional">
          <Input id="dataInicioControle" name="dataInicioControle" type="date" />
        </Field>
        <Field label="Fim do controle" htmlFor="dataFimControle" hint="Opcional — conta encerrada">
          <Input id="dataFimControle" name="dataFimControle" type="date" />
        </Field>
      </div>
    </form>
  );
}
