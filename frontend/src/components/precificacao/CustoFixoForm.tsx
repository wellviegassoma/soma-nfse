"use client";

import { useActionState } from "react";
import { saveCustoFixo } from "@/lib/actions/precificacao";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import type { PrecificacaoCustoFixo } from "@/lib/types";

export function CustoFixoForm({
  companyId,
  basePath,
  custoFixo,
  onCancel,
}: {
  companyId: string;
  basePath: string;
  custoFixo?: PrecificacaoCustoFixo;
  onCancel?: () => void;
}) {
  const [state, formAction, pending] = useActionState(saveCustoFixo, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="basePath" value={basePath} />
      {custoFixo && <input type="hidden" name="custoFixoId" value={custoFixo.id} />}

      {state?.error && <Alert tone="danger">{state.error}</Alert>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_auto]">
        <Field label="Descrição" htmlFor="descricao">
          <Input
            id="descricao"
            name="descricao"
            placeholder="Ex.: Aluguel, luz, internet, pró-labore"
            defaultValue={custoFixo?.descricao}
            required
          />
        </Field>
        <Field label="Valor mensal (R$)" htmlFor="valorMensal">
          <Input
            id="valorMensal"
            name="valorMensal"
            type="number"
            step="0.01"
            min={0}
            defaultValue={custoFixo?.valor_mensal ?? ""}
            required
          />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2.5 text-sm text-foreground">
          <input
            type="checkbox"
            name="ativo"
            defaultChecked={custoFixo?.ativo ?? true}
            className="h-4 w-4 rounded border-border accent-brand"
          />
          Ativo
        </label>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="md" loading={pending}>
          {custoFixo ? "Salvar" : "Adicionar custo fixo"}
        </Button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-sm font-medium text-foreground/60 hover:underline"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
