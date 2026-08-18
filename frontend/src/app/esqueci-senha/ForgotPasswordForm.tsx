"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordReset,
    undefined,
  );

  if (state?.success) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">
          Se esse e-mail estiver cadastrado, enviamos um link para redefinir a
          senha. Confira também o spam.
        </Alert>
        <Link
          href="/login"
          className="text-center text-sm font-medium text-brand hover:underline"
        >
          Voltar para o login
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}

      <Field label="E-mail" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          placeholder="voce@empresa.com.br"
          required
        />
      </Field>

      <Button type="submit" size="lg" loading={pending} className="mt-2 w-full">
        Enviar link de redefinição
      </Button>

      <Link
        href="/login"
        className="text-center text-sm font-medium text-foreground/60 hover:underline"
      >
        Voltar para o login
      </Link>
    </form>
  );
}
