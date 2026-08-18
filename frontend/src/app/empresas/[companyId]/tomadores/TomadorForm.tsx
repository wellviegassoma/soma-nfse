"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { saveCustomer } from "@/lib/actions/tomadores";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import type { Customer } from "@/lib/types";

export function TomadorForm({
  companyId,
  customer,
}: {
  companyId: string;
  customer?: Customer;
}) {
  const [state, formAction, pending] = useActionState(saveCustomer, undefined);
  const [type, setType] = useState(customer?.type ?? "PF");

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="companyId" value={companyId} />
      {customer && <input type="hidden" name="customerId" value={customer.id} />}

      {state?.error && <Alert tone="danger">{state.error}</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Tipo" htmlFor="type">
          <Select
            id="type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as "PF" | "PJ")}
          >
            <option value="PF">Pessoa física</option>
            <option value="PJ">Pessoa jurídica</option>
          </Select>
        </Field>
        <Field label={type === "PF" ? "CPF" : "CNPJ"} htmlFor="cpfCnpj" hint="Opcional">
          <Input id="cpfCnpj" name="cpfCnpj" defaultValue={customer?.cpf_cnpj ?? ""} />
        </Field>
      </div>

      <Field label={type === "PF" ? "Nome" : "Razão social"} htmlFor="name">
        <Input id="name" name="name" defaultValue={customer?.name} autoFocus required />
      </Field>

      <Field label="E-mail" htmlFor="email" hint="Opcional">
        <Input id="email" name="email" type="email" defaultValue={customer?.email ?? ""} />
      </Field>

      <details className="group" open={Boolean(customer?.address)}>
        <summary className="cursor-pointer text-sm font-medium text-brand">
          Endereço (opcional)
        </summary>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="CEP" htmlFor="zipCode">
            <Input id="zipCode" name="zipCode" defaultValue={customer?.zip_code ?? ""} />
          </Field>
          <Field label="Cidade" htmlFor="city">
            <Input id="city" name="city" defaultValue={customer?.city ?? ""} />
          </Field>
          <Field label="Endereço" htmlFor="address">
            <Input id="address" name="address" defaultValue={customer?.address ?? ""} />
          </Field>
          <Field label="Número" htmlFor="number">
            <Input id="number" name="number" defaultValue={customer?.number ?? ""} />
          </Field>
          <Field label="Complemento" htmlFor="complement">
            <Input id="complement" name="complement" defaultValue={customer?.complement ?? ""} />
          </Field>
          <Field label="Bairro" htmlFor="district">
            <Input id="district" name="district" defaultValue={customer?.district ?? ""} />
          </Field>
          <Field label="UF" htmlFor="state">
            <Input id="state" name="state" maxLength={2} defaultValue={customer?.state ?? ""} />
          </Field>
        </div>
      </details>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          Salvar
        </Button>
        <Link
          href={`/empresas/${companyId}/tomadores`}
          className="text-sm font-medium text-foreground/60 hover:underline"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
