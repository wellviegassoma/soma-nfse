"use client";

import { useActionState } from "react";
import { editarProcesso } from "@/lib/actions/legalizacao-processos";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { ALTERACAO_ITEM_LABELS } from "@/app/legalizacao/processos/status";

type Processo = {
  id: string;
  tipo_processo: string;
  nome: string;
  prazo_final: string | null;
  responsavel_id: string | null;
  detalhes: string | null;
  contato_nome: string | null;
  contato_email: string | null;
  contato_whatsapp: string | null;
  alteracao_itens: string[];
};

export function EditarProcessoForm({
  processo,
  responsaveis,
  podeEditar,
}: {
  processo: Processo;
  responsaveis: { id: string; full_name: string }[];
  podeEditar: boolean;
}) {
  const [state, formAction, pending] = useActionState(editarProcesso, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="processoId" value={processo.id} />
      {state?.error && <Alert tone="danger">{state.error}</Alert>}

      <Field label="Nome" htmlFor="nome">
        <Input id="nome" name="nome" defaultValue={processo.nome} required disabled={!podeEditar} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Prazo final" htmlFor="prazoFinal" hint="Opcional">
          <Input id="prazoFinal" name="prazoFinal" type="date" defaultValue={processo.prazo_final ?? ""} disabled={!podeEditar} />
        </Field>
        <Field label="Responsável" htmlFor="responsavelId" hint="Opcional">
          <Select id="responsavelId" name="responsavelId" defaultValue={processo.responsavel_id ?? ""} disabled={!podeEditar}>
            <option value="">Não definido</option>
            {responsaveis.map((r) => (
              <option key={r.id} value={r.id}>
                {r.full_name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {processo.tipo_processo === "ALTERACAO" && (
        <Field label="O que muda" htmlFor="alteracaoItens">
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3">
            {Object.entries(ALTERACAO_ITEM_LABELS).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  name="alteracaoItens"
                  value={value}
                  defaultChecked={processo.alteracao_itens.includes(value)}
                  disabled={!podeEditar}
                  className="h-4 w-4 rounded border-border accent-brand"
                />
                {label}
              </label>
            ))}
          </div>
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Contato — nome" htmlFor="contatoNome" hint="Opcional">
          <Input id="contatoNome" name="contatoNome" defaultValue={processo.contato_nome ?? ""} disabled={!podeEditar} />
        </Field>
        <Field label="Contato — e-mail" htmlFor="contatoEmail" hint="Opcional">
          <Input id="contatoEmail" name="contatoEmail" type="email" defaultValue={processo.contato_email ?? ""} disabled={!podeEditar} />
        </Field>
        <Field label="Contato — WhatsApp" htmlFor="contatoWhatsapp" hint="Opcional">
          <Input id="contatoWhatsapp" name="contatoWhatsapp" defaultValue={processo.contato_whatsapp ?? ""} disabled={!podeEditar} />
        </Field>
      </div>

      <Field label="Detalhes" htmlFor="detalhes" hint="Opcional">
        <textarea
          id="detalhes"
          name="detalhes"
          rows={4}
          defaultValue={processo.detalhes ?? ""}
          disabled={!podeEditar}
          className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground outline-none transition-shadow focus:border-brand focus:ring-4 focus:ring-brand/15 disabled:opacity-60"
        />
      </Field>

      {podeEditar && (
        <div>
          <Button type="submit" loading={pending}>
            Salvar
          </Button>
        </div>
      )}
    </form>
  );
}
