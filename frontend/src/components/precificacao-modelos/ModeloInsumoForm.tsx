"use client";

import { useActionState } from "react";
import { saveModeloInsumo } from "@/lib/actions/precificacao-modelos";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import type { PrecificacaoModeloInsumo } from "@/lib/types";

export function ModeloInsumoForm({
  modeloId,
  insumo,
}: {
  modeloId: string;
  insumo?: PrecificacaoModeloInsumo;
}) {
  const [state, formAction, pending] = useActionState(saveModeloInsumo, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="modeloId" value={modeloId} />
      {insumo && <input type="hidden" name="modeloInsumoId" value={insumo.id} />}

      {state?.error && <Alert tone="danger">{state.error}</Alert>}

      <Field label="Nome do insumo" htmlFor="nome">
        <Input id="nome" name="nome" defaultValue={insumo?.nome} required />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Unidade de compra" htmlFor="unidadeCompra">
          <Input id="unidadeCompra" name="unidadeCompra" defaultValue={insumo?.unidade_compra ?? ""} />
        </Field>
        <Field label="Valor da compra (R$)" htmlFor="valorCompra">
          <Input
            id="valorCompra"
            name="valorCompra"
            type="number"
            step="0.01"
            min={0}
            required
            defaultValue={insumo?.valor_compra ?? ""}
          />
        </Field>
        <Field label="Quantidade por compra" htmlFor="quantidadePorCompra">
          <Input
            id="quantidadePorCompra"
            name="quantidadePorCompra"
            type="number"
            step="0.0001"
            min={0}
            required
            defaultValue={insumo?.quantidade_por_compra ?? ""}
          />
        </Field>
      </div>

      <Field label="Observações" htmlFor="observacoes">
        <Input id="observacoes" name="observacoes" defaultValue={insumo?.observacoes ?? ""} />
      </Field>

      <div>
        <Button type="submit" loading={pending}>
          Salvar insumo
        </Button>
      </div>
    </form>
  );
}
