"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createCompany } from "@/lib/actions/empresas";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";

export function NewCompanyForm() {
  const [state, formAction, pending] = useActionState(createCompany, undefined);

  return (
    <Card className="max-w-lg p-6 sm:p-8">
      <form action={formAction} className="flex flex-col gap-4">
        {state?.error && <Alert tone="danger">{state.error}</Alert>}

        <Field
          label="Nome da empresa/organização"
          htmlFor="organizationName"
          hint="Como o grupo é conhecido internamente (ex.: Clínica ABC)."
        >
          <Input id="organizationName" name="organizationName" autoFocus required />
        </Field>

        <Field label="Razão social" htmlFor="legalName">
          <Input id="legalName" name="legalName" required />
        </Field>

        <Field label="Nome fantasia" htmlFor="tradeName" hint="Opcional">
          <Input id="tradeName" name="tradeName" />
        </Field>

        <Field label="CNPJ" htmlFor="cnpj" hint="Pode ser preenchido depois">
          <Input id="cnpj" name="cnpj" placeholder="00.000.000/0000-00" />
        </Field>

        <div className="mt-2 flex items-center gap-3">
          <Button type="submit" loading={pending}>
            Criar empresa
          </Button>
          <Link
            href="/admin/empresas"
            className="text-sm font-medium text-foreground/60 hover:underline"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </Card>
  );
}
