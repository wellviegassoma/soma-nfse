"use client";

import { useActionState, useRef, useEffect } from "react";
import { criarTipoDocumento } from "@/lib/actions/legalizacao";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";

export function NovoTipoDocumentoForm() {
  const [state, formAction, pending] = useActionState(criarTipoDocumento, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state?.success]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <div className="flex flex-wrap items-end gap-3">
        <Input
          name="nome"
          placeholder="Ex.: Licença Ambiental"
          required
          className="w-64"
        />
        <Button type="submit" variant="secondary" loading={pending}>
          + Adicionar tipo
        </Button>
      </div>
    </form>
  );
}
