"use client";

import { useActionState, useState, useTransition } from "react";
import {
  salvarCredencialPetropolis,
  apagarCredencialPetropolis,
} from "@/lib/actions/petropolis-credenciais";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export function PetropolisCredencialForm({
  companyId,
  loginAtual,
}: {
  companyId: string;
  loginAtual: string | null;
}) {
  const [editando, setEditando] = useState(false);
  const [state, formAction, pending] = useActionState(salvarCredencialPetropolis, undefined);
  const [apagando, startApagar] = useTransition();

  if (state?.success && editando) setEditando(false);

  if (!editando) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <div className="text-xs text-foreground/60">
          {loginAtual ? (
            <>
              Login próprio no ISS de Petrópolis: <b className="text-foreground">{loginAtual}</b>
            </>
          ) : (
            "Sem login próprio — usando o acesso do escritório (escolhe a empresa na lista)."
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="md" className="h-8 px-2 text-xs" onClick={() => setEditando(true)}>
            {loginAtual ? "Trocar login/senha" : "Cadastrar login próprio"}
          </Button>
          {loginAtual && (
            <Button
              type="button"
              variant="ghost"
              size="md"
              className="h-8 px-2 text-xs text-danger"
              loading={apagando}
              onClick={() => startApagar(() => apagarCredencialPetropolis(companyId))}
            >
              Remover
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <input type="hidden" name="companyId" value={companyId} />
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <p className="text-xs text-foreground/50">
        Login e senha próprios da empresa no site da Prefeitura de Petrópolis. Deixe sem cadastrar
        se a empresa entra pelo acesso do escritório.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Login (geralmente o CNPJ)" htmlFor="petropolisLogin">
          <Input id="petropolisLogin" name="login" defaultValue={loginAtual ?? ""} required />
        </Field>
        <Field label="Senha" htmlFor="petropolisSenha">
          <Input id="petropolisSenha" name="senha" type="password" required />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" size="md" className="h-9 px-3 text-xs" loading={pending}>
          Salvar
        </Button>
        <Button type="button" variant="ghost" size="md" className="h-9 px-3 text-xs" onClick={() => setEditando(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
