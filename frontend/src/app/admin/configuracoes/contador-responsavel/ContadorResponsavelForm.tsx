"use client";

import { useActionState } from "react";
import { updateContadorResponsavel, type ContadorResponsavel } from "@/lib/actions/configuracoes";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";

export function ContadorResponsavelForm({ contador }: { contador: ContadorResponsavel | null }) {
  const [state, formAction, pending] = useActionState(updateContadorResponsavel, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.success && <Alert tone="success">Dados salvos.</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="CPF" htmlFor="cpf">
          <Input id="cpf" name="cpf" defaultValue={contador?.cpf ?? ""} required />
        </Field>
        <Field label="E-mail" htmlFor="email">
          <Input id="email" name="email" type="email" defaultValue={contador?.email ?? ""} required />
        </Field>
        <Field label="UF do CRC" htmlFor="crcUf">
          <Input id="crcUf" name="crcUf" maxLength={2} defaultValue={contador?.crc_uf ?? ""} required />
        </Field>
        <Field label="Número do CRC" htmlFor="crcNumero">
          <Input id="crcNumero" name="crcNumero" defaultValue={contador?.crc_numero ?? ""} required />
        </Field>
        <Field label="DDD do telefone" htmlFor="telefoneDdd">
          <Input id="telefoneDdd" name="telefoneDdd" maxLength={2} defaultValue={contador?.telefone_ddd ?? ""} required />
        </Field>
        <Field label="Telefone (sem DDD)" htmlFor="telefoneNumero">
          <Input id="telefoneNumero" name="telefoneNumero" defaultValue={contador?.telefone_numero ?? ""} required />
        </Field>
      </div>

      <div>
        <Button type="submit" loading={pending}>
          Salvar
        </Button>
      </div>
    </form>
  );
}
