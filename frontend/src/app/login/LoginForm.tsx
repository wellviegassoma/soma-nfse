"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

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

      <Field label="Senha" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
        />
      </Field>

      <Button type="submit" size="lg" loading={pending} className="mt-2 w-full">
        Entrar
      </Button>

      <Link
        href="/esqueci-senha"
        className="text-center text-sm font-medium text-brand hover:underline"
      >
        Esqueci minha senha
      </Link>
    </form>
  );
}
