"use client";

import { useState, useRef, useTransition } from "react";
import { salvarFluxo } from "@/lib/actions/legalizacao-processos";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";

type Fluxo = {
  id: string;
  chave: string;
  nome: string;
  tipo_processo: string;
  prazo_padrao_dias: number | null;
  ordem: number;
};

export function FluxoForm({ fluxo, compact }: { fluxo?: Fluxo; compact?: boolean }) {
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  if (compact && !editando) {
    return (
      <Button type="button" variant="ghost" size="md" className="h-7 px-2 text-xs" onClick={() => setEditando(true)}>
        Editar
      </Button>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const resultado = await salvarFluxo(undefined, formData);
      if (resultado?.error) {
        setError(resultado.error);
        return;
      }
      if (compact) setEditando(false);
      else formRef.current?.reset();
    });
  }

  const suffix = fluxo?.id ?? "novo";

  return (
    <div className="flex flex-col gap-2">
      {error && <Alert tone="danger">{error}</Alert>}
      <form ref={formRef} onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        {fluxo && <input type="hidden" name="fluxoId" value={fluxo.id} />}
        <Field label="Chave" htmlFor={`chave-${suffix}`} hint="MAIUSCULA_COM_UNDERSCORE">
          <Input id={`chave-${suffix}`} name="chave" defaultValue={fluxo?.chave} required className="w-52" />
        </Field>
        <Field label="Nome" htmlFor={`nome-${suffix}`}>
          <Input id={`nome-${suffix}`} name="nome" defaultValue={fluxo?.nome} required className="w-56" />
        </Field>
        <Field label="Tipo de processo" htmlFor={`tipo-${suffix}`}>
          <Select id={`tipo-${suffix}`} name="tipoProcesso" defaultValue={fluxo?.tipo_processo ?? "ABERTURA"} className="w-48">
            <option value="ABERTURA">Abertura de empresa</option>
            <option value="ALTERACAO">Alteração contratual</option>
            <option value="ENCERRAMENTO">Encerramento de empresa</option>
          </Select>
        </Field>
        <Field label="Prazo padrão (dias)" htmlFor={`prazo-${suffix}`} hint="Opcional">
          <Input
            id={`prazo-${suffix}`}
            name="prazoPadraoDias"
            type="number"
            min={1}
            defaultValue={fluxo?.prazo_padrao_dias ?? ""}
            className="w-32"
          />
        </Field>
        <Field label="Ordem" htmlFor={`ordem-${suffix}`}>
          <Input id={`ordem-${suffix}`} name="ordem" type="number" defaultValue={fluxo?.ordem ?? 0} required className="w-20" />
        </Field>
        <Button type="submit" variant="secondary" loading={pending}>
          Salvar
        </Button>
        {compact && (
          <Button type="button" variant="ghost" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
        )}
      </form>
    </div>
  );
}
