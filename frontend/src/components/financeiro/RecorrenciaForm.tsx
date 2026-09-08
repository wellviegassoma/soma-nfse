"use client";

import { useActionState, useState } from "react";
import { criarRecorrencia } from "@/lib/actions/financeiro-lancamentos";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import {
  FREQUENCIAS,
  FREQUENCIA_LABELS,
  type AgendamentoTipo,
} from "@/lib/financeiro";

type Opcao = { id: string; nome: string };

type Props = {
  companyId: string;
  tipo: AgendamentoTipo;
  contatos: Opcao[];
  categorias: Opcao[];
  centrosCusto: Opcao[];
};

/** Mesmo padrão do AgendamentoForm: os campos remontam por `key` no sucesso. */
export function RecorrenciaForm(props: Props) {
  const [state, formAction, pending] = useActionState(criarRecorrencia, undefined);
  return (
    <Campos
      key={state?.at ?? 0}
      {...props}
      state={state}
      formAction={formAction}
      pending={pending}
    />
  );
}

function Campos({
  companyId,
  tipo,
  contatos,
  categorias,
  centrosCusto,
  state,
  formAction,
  pending,
}: Props & {
  state: Awaited<ReturnType<typeof criarRecorrencia>>;
  formAction: (formData: FormData) => void;
  pending: boolean;
}) {
  const [temFim, setTemFim] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="tipo" value={tipo} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label="Primeiro vencimento"
          htmlFor="dataInicio"
          hint="Todas as datas são contadas a partir daqui."
        >
          <Input id="dataInicio" name="dataInicio" type="date" required />
        </Field>
        <Field label="Frequência" htmlFor="freqRec">
          <Select id="freqRec" name="frequencia" defaultValue="MENSAL">
            {FREQUENCIAS.map((f) => (
              <option key={f} value={f}>
                {FREQUENCIA_LABELS[f]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tipo === "PAGAR" ? "Fornecedor" : "Cliente"} htmlFor="contatoRec">
          <Select id="contatoRec" name="contatoId" defaultValue="">
            <option value="">Sem contato</option>
            {contatos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Valor" htmlFor="valorRec">
          <Input
            id="valorRec"
            name="valorBruto"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="0,00"
          />
        </Field>
        <Field label="Categoria" htmlFor="categoriaRec">
          <Select id="categoriaRec" name="categoriaId" required defaultValue="">
            <option value="" disabled>
              Selecione...
            </option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </Field>
        {centrosCusto.length > 0 && (
          <Field label="Centro de custo" htmlFor="centroRec">
            <Select id="centroRec" name="centroCustoId" defaultValue="">
              <option value="">Nenhum</option>
              {centrosCusto.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Descrição" htmlFor="descricaoRec">
          <Input id="descricaoRec" name="descricao" placeholder="Ex.: Aluguel da sala" />
        </Field>
        <Field label="Referência" htmlFor="referenciaRec">
          <Input id="referenciaRec" name="referencia" placeholder="Contrato, CNPJ..." />
        </Field>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 text-sm text-foreground/70">
          <input
            type="checkbox"
            checked={temFim}
            onChange={(e) => setTemFim(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-brand"
          />
          Tem data para acabar
        </label>
        {temFim ? (
          <Field label="Último vencimento" htmlFor="dataFim">
            <div className="w-48">
              <Input id="dataFim" name="dataFim" type="date" />
            </div>
          </Field>
        ) : (
          <p className="pb-2 text-xs text-foreground/55">
            Sem data de fim: o sistema mantém 12 meses agendados à frente e vai completando
            sozinho.
          </p>
        )}
      </div>

      <div>
        <Button type="submit" loading={pending}>
          Criar recorrência
        </Button>
      </div>
    </form>
  );
}
