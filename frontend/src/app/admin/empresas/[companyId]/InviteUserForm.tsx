"use client";

import { useActionState, useRef, useEffect } from "react";
import { inviteUserToCompany } from "@/lib/actions/empresas";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { ROLE_LABELS, type UserRole } from "@/lib/types";

const ROLES: UserRole[] = ["ADMIN_CLIENTE", "EMISSOR", "ADMIN_SOMA", "SUPER_ADMIN"];

export function InviteUserForm({ companyId }: { companyId: string }) {
  const [state, formAction, pending] = useActionState(
    inviteUserToCompany,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state?.success]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="companyId" value={companyId} />

      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.success && (
        <Alert tone="success">Convite enviado e acesso vinculado.</Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor="fullName">
          <Input id="fullName" name="fullName" required />
        </Field>
        <Field label="E-mail" htmlFor="email">
          <Input id="email" name="email" type="email" required />
        </Field>
      </div>

      <Field label="Papel" htmlFor="role">
        <select
          id="role"
          name="role"
          defaultValue="EMISSOR"
          className="h-11 w-full rounded-lg border border-border bg-surface px-3.5 text-[15px] text-foreground outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </Field>

      <div>
        <Button type="submit" loading={pending}>
          Convidar usuário
        </Button>
      </div>
    </form>
  );
}
