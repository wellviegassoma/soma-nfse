"use client";

import { useActionState } from "react";
import { saveInsumo } from "@/lib/actions/precificacao";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import type { PrecificacaoInsumo } from "@/lib/types";

export function InsumoForm({
  companyId,
  basePath,
  insumo,
}: {
  companyId: string;
  basePath: string;
  insumo?: PrecificacaoInsumo;
}) {
  const [state, formAction, pending] = useActionState(saveInsumo, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="basePath" value={basePath} />
      {insumo && <input type="hidden" name="insumoId" value={insumo.id} />}

      {state?.error && <Alert tone="danger">{state.error}</Alert>}

      <Field label="Nome do insumo" htmlFor="nome">
        <Input id="nome" name="nome" defaultValue={insumo?.nome} required />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Unidade de compra"
          htmlFor="unidadeCompra"
          hint='Ex.: "caixa de 30 unidades", "frasco de 250ml"'
        >
          <Input
            id="unidadeCompra"
            name="unidadeCompra"
            defaultValue={insumo?.unidade_compra ?? ""}
          />
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
        <Field
          label="Quantidade por compra"
          htmlFor="quantidadePorCompra"
          hint="Quantas unidades de uso saem de uma compra (ex.: 30 usos numa caixa de 30)"
        >
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
