"use client";

import { useActionState } from "react";
import { updateCompanyIdentity } from "@/lib/actions/empresas";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";

export function CompanyNameForm({
  companyId,
  legalName,
  tradeName,
}: {
  companyId: string;
  legalName: string;
  tradeName: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateCompanyIdentity, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="companyId" value={companyId} />

      <h2 className="text-sm font-semibold text-foreground/70">Nome da empresa</h2>

      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.success && <Alert tone="success">Nome salvo.</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Razão social" htmlFor="legalName">
          <Input id="legalName" name="legalName" defaultValue={legalName} required />
        </Field>
        <Field label="Nome fantasia" htmlFor="tradeName" hint="Opcional">
          <Input id="tradeName" name="tradeName" defaultValue={tradeName ?? ""} />
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
