"use client";

import { useActionState } from "react";
import { saveModelo } from "@/lib/actions/precificacao-modelos";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import type { PrecificacaoModelo } from "@/lib/types";

export function ModeloForm({ modelo }: { modelo?: PrecificacaoModelo }) {
  const [state, formAction, pending] = useActionState(saveModelo, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {modelo && <input type="hidden" name="modeloId" value={modelo.id} />}

      {state?.error && <Alert tone="danger">{state.error}</Alert>}

      <Field label="Nome do modelo" htmlFor="nome" hint='Ex.: "SOMA Odontologia", "SOMA Medicina"'>
        <Input id="nome" name="nome" defaultValue={modelo?.nome} required />
      </Field>

      <Field label="Especialidade" htmlFor="especialidade">
        <Input id="especialidade" name="especialidade" defaultValue={modelo?.especialidade ?? ""} />
      </Field>

      <Field label="Descrição" htmlFor="descricao">
        <Input id="descricao" name="descricao" defaultValue={modelo?.descricao ?? ""} />
      </Field>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          name="ativo"
          defaultChecked={modelo?.ativo ?? true}
          className="h-4 w-4 rounded border-border accent-brand"
        />
        Ativo (visível para empresas importarem)
      </label>

      <div>
        <Button type="submit" loading={pending}>
          Salvar modelo
        </Button>
      </div>
    </form>
  );
}
