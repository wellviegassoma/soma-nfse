"use client";

import { useActionState } from "react";
import { salvarFolhaMensal } from "@/lib/actions/folha";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";

export function FolhaMensalForm({
  companyId,
  competencia,
  valorAtual,
}: {
  companyId: string;
  competencia: string;
  valorAtual: number | null;
}) {
  const [state, formAction, pending] = useActionState(salvarFolhaMensal, undefined);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="competencia" value={competencia} />
      <div className="w-[220px]">
        <Field label="Folha de pagamento do mês (R$)" htmlFor="valor">
          <Input
            id="valor"
            name="valor"
            type="number"
            step="0.01"
            min={0}
            defaultValue={valorAtual ?? ""}
            required
          />
        </Field>
      </div>
      <Button type="submit" variant="secondary" loading={pending}>
        Salvar folha do mês
      </Button>
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.success && <Alert tone="success">Folha do mês salva.</Alert>}
    </form>
  );
}
