"use client";

import { useActionState } from "react";
import { saveModeloProcedimento } from "@/lib/actions/precificacao-modelos";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import type { PrecificacaoModeloProcedimento } from "@/lib/types";

export function ModeloProcedimentoForm({
  modeloId,
  procedimento,
}: {
  modeloId: string;
  procedimento?: PrecificacaoModeloProcedimento;
}) {
  const [state, formAction, pending] = useActionState(saveModeloProcedimento, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="modeloId" value={modeloId} />
      {procedimento && <input type="hidden" name="modeloProcedimentoId" value={procedimento.id} />}

      {state?.error && <Alert tone="danger">{state.error}</Alert>}

      <Field label="Nome do procedimento" htmlFor="nome">
        <Input id="nome" name="nome" defaultValue={procedimento?.nome} required />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Especialidade" htmlFor="especialidade">
          <Input id="especialidade" name="especialidade" defaultValue={procedimento?.especialidade ?? ""} />
        </Field>
        <Field label="Tempo de atendimento (horas)" htmlFor="tempoAtendimentoHoras">
          <Input
            id="tempoAtendimentoHoras"
            name="tempoAtendimentoHoras"
            type="number"
            step="0.01"
            min={0}
            required
            defaultValue={procedimento?.tempo_atendimento_horas ?? ""}
          />
        </Field>
        <Field label="Preço de venda (R$)" htmlFor="precoVenda">
          <Input
            id="precoVenda"
            name="precoVenda"
            type="number"
            step="0.01"
            min={0}
            required
            defaultValue={procedimento?.preco_venda ?? ""}
          />
        </Field>
        <Field label="Custo de laboratório/terceiro (R$)" htmlFor="custoLaboratorio">
          <Input
            id="custoLaboratorio"
            name="custoLaboratorio"
            type="number"
            step="0.01"
            min={0}
            defaultValue={procedimento?.custo_laboratorio ?? ""}
          />
        </Field>
        <Field label="Honorário fixo a profissional (R$)" htmlFor="honorarioProfissionalFixo">
          <Input
            id="honorarioProfissionalFixo"
            name="honorarioProfissionalFixo"
            type="number"
            step="0.01"
            min={0}
            defaultValue={procedimento?.honorario_profissional_fixo ?? ""}
          />
        </Field>
        <Field label="Retrabalho estimado (%)" htmlFor="percentualRetrabalho">
          <Input
            id="percentualRetrabalho"
            name="percentualRetrabalho"
            type="number"
            step="0.01"
            min={0}
            max={100}
            defaultValue={
              procedimento ? Number((procedimento.percentual_retrabalho * 100).toFixed(4)) : ""
            }
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          name="ativo"
          defaultChecked={procedimento?.ativo ?? true}
          className="h-4 w-4 rounded border-border accent-brand"
        />
        Ativo
      </label>

      <div>
        <Button type="submit" loading={pending}>
          Salvar procedimento
        </Button>
      </div>
    </form>
  );
}
