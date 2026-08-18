"use client";

import { useActionState } from "react";
import Link from "next/link";
import { saveService } from "@/lib/actions/servicos";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import type { Service } from "@/lib/types";

export function ServiceForm({
  companyId,
  service,
}: {
  companyId: string;
  service?: Service;
}) {
  const [state, formAction, pending] = useActionState(saveService, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="companyId" value={companyId} />
      {service && <input type="hidden" name="serviceId" value={service.id} />}

      {state?.error && <Alert tone="danger">{state.error}</Alert>}

      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-foreground/70">
          O que o cliente vê
        </h2>
        <Field label="Nome exibido" htmlFor="name">
          <Input id="name" name="name" defaultValue={service?.name} required />
        </Field>
        <Field label="Descrição padrão" htmlFor="description">
          <Input
            id="description"
            name="description"
            defaultValue={service?.description ?? ""}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            name="active"
            defaultChecked={service?.active ?? true}
            className="h-4 w-4 rounded border-border accent-brand"
          />
          Ativo
        </label>
      </div>

      <div className="flex flex-col gap-4 border-t border-border pt-5">
        <h2 className="text-sm font-semibold text-foreground/70">
          Dados fiscais (a SOMA configura — o cliente nunca vê isso)
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Código tributário nacional" htmlFor="nationalTaxCode">
            <Input
              id="nationalTaxCode"
              name="nationalTaxCode"
              defaultValue={service?.national_tax_code ?? ""}
            />
          </Field>
          <Field label="Código tributário municipal" htmlFor="municipalTaxCode">
            <Input
              id="municipalTaxCode"
              name="municipalTaxCode"
              defaultValue={service?.municipal_tax_code ?? ""}
            />
          </Field>
          <Field label="NBS" htmlFor="nbs">
            <Input id="nbs" name="nbs" defaultValue={service?.nbs ?? ""} />
          </Field>
          <Field label="Alíquota ISS (%)" htmlFor="issRate">
            <Input
              id="issRate"
              name="issRate"
              type="number"
              step="0.01"
              min={0}
              max={100}
              defaultValue={service?.iss_rate ?? ""}
            />
          </Field>
          <Field label="Regime especial de tributação" htmlFor="taxationType">
            <Input
              id="taxationType"
              name="taxationType"
              defaultValue={service?.taxation_type ?? ""}
            />
          </Field>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          Salvar
        </Button>
        <Link
          href={`/admin/empresas/${companyId}/servicos`}
          className="text-sm font-medium text-foreground/60 hover:underline"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
