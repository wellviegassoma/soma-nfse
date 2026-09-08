"use client";

import { useActionState, useEffect, useRef } from "react";
import { criarCentroCusto } from "@/lib/actions/financeiro";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";

export function CentroCustoForm({ companyId }: { companyId: string }) {
  const [state, formAction, pending] = useActionState(criarCentroCusto, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <input type="hidden" name="companyId" value={companyId} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <Input name="nome" required placeholder="Ex.: Unidade Centro" />
        </div>
        <Button type="submit" variant="secondary" loading={pending}>
          + Adicionar centro de custo
        </Button>
      </div>
    </form>
  );
}
