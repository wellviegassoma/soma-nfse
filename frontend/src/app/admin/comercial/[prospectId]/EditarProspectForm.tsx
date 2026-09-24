"use client";

import { useActionState } from "react";
import { editarProspect } from "@/lib/actions/comercial";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";

type Prospect = {
  id: string;
  nome: string;
  tipo_onboarding: string | null;
  pessoa_tipo: string | null;
  especialidade: string | null;
  regime_tributario: string | null;
  faturamento_medio_estimado: number | null;
  cnpj: string | null;
  cpf: string | null;
  honorario_soma: number | null;
  descricao: string | null;
};

export function EditarProspectForm({ prospect, podeEditar }: { prospect: Prospect; podeEditar: boolean }) {
  const [state, formAction, pending] = useActionState(editarProspect, undefined);

  return (
    <fieldset disabled={!podeEditar} className="contents">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="prospectId" value={prospect.id} />
        {state?.error && <Alert tone="danger">{state.error}</Alert>}

        <Field label="Nome" htmlFor="nome">
          <Input id="nome" name="nome" defaultValue={prospect.nome} required />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Tipo do caso" htmlFor="tipoOnboarding">
            <Select id="tipoOnboarding" name="tipoOnboarding" defaultValue={prospect.tipo_onboarding ?? ""}>
              <option value="">Não definido</option>
              <option value="TRANSICAO_CONTABIL">Transição contábil (já tem CNPJ)</option>
              <option value="ABERTURA_NOVO_CNPJ">Abertura de CNPJ novo</option>
            </Select>
          </Field>
          <Field label="Pessoa" htmlFor="pessoaTipo">
            <Select id="pessoaTipo" name="pessoaTipo" defaultValue={prospect.pessoa_tipo ?? ""}>
              <option value="">Não definido</option>
              <option value="PJ">Pessoa Jurídica</option>
              <option value="PF">Pessoa Física</option>
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="CNPJ" htmlFor="cnpj">
            <Input id="cnpj" name="cnpj" defaultValue={prospect.cnpj ?? ""} />
          </Field>
          <Field label="CPF" htmlFor="cpf">
            <Input id="cpf" name="cpf" defaultValue={prospect.cpf ?? ""} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Especialidade / cidade" htmlFor="especialidade">
            <Input id="especialidade" name="especialidade" defaultValue={prospect.especialidade ?? ""} />
          </Field>
          <Field label="Regime tributário" htmlFor="regimeTributario">
            <Input id="regimeTributario" name="regimeTributario" defaultValue={prospect.regime_tributario ?? ""} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Faturamento médio estimado" htmlFor="faturamentoMedioEstimado">
            <Input
              id="faturamentoMedioEstimado"
              name="faturamentoMedioEstimado"
              inputMode="decimal"
              defaultValue={prospect.faturamento_medio_estimado ?? ""}
            />
          </Field>
          <Field label="Honorário SOMA" htmlFor="honorarioSoma">
            <Input
              id="honorarioSoma"
              name="honorarioSoma"
              inputMode="decimal"
              defaultValue={prospect.honorario_soma ?? ""}
            />
          </Field>
        </div>

        <Field label="Descrição" htmlFor="descricao">
          <textarea
            id="descricao"
            name="descricao"
            rows={4}
            defaultValue={prospect.descricao ?? ""}
            className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-[15px] text-foreground outline-none transition-shadow focus:border-brand focus:ring-4 focus:ring-brand/15"
          />
        </Field>

        {podeEditar && (
          <div>
            <Button type="submit" variant="secondary" loading={pending}>
              Salvar
            </Button>
            {state?.success && <span className="ml-3 text-xs text-success">Salvo</span>}
          </div>
        )}
      </form>
    </fieldset>
  );
}
