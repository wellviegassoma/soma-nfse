"use client";

import { useActionState } from "react";
import { updatePassword } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";

export function UpdatePasswordForm() {
  const [state, formAction, pending] = useActionState(updatePassword, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}

      <Field label="Nova senha" htmlFor="password" hint="Pelo menos 8 caracteres.">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          autoFocus
          required
        />
      </Field>

      <Field label="Confirme a nova senha" htmlFor="confirmPassword">
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>

      <Button type="submit" size="lg" loading={pending} className="mt-2 w-full">
        Salvar nova senha
      </Button>
    </form>
  );
}
