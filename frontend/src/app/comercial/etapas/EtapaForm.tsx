"use client";

import { useState, useRef, useTransition } from "react";
import { salvarEtapa } from "@/lib/actions/comercial";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";

type Etapa = { id: string; nome: string; ordem: number; cor: string; tipo: string };

export function EtapaForm({ etapa, compact }: { etapa?: Etapa; compact?: boolean }) {
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
      const resultado = await salvarEtapa(undefined, formData);
      if (resultado?.error) {
        setError(resultado.error);
        return;
      }
      if (compact) setEditando(false);
      else formRef.current?.reset();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <Alert tone="danger">{error}</Alert>}
      <form ref={formRef} onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        {etapa && <input type="hidden" name="etapaId" value={etapa.id} />}
        <Field label="Nome" htmlFor={`nome-${etapa?.id ?? "novo"}`}>
          <Input id={`nome-${etapa?.id ?? "novo"}`} name="nome" defaultValue={etapa?.nome} required className="w-56" />
        </Field>
        <Field label="Ordem" htmlFor={`ordem-${etapa?.id ?? "novo"}`}>
          <Input
            id={`ordem-${etapa?.id ?? "novo"}`}
            name="ordem"
            type="number"
            defaultValue={etapa?.ordem ?? 0}
            required
            className="w-20"
          />
        </Field>
        <Field label="Cor" htmlFor={`cor-${etapa?.id ?? "novo"}`}>
          <input
            id={`cor-${etapa?.id ?? "novo"}`}
            name="cor"
            type="color"
            defaultValue={etapa?.cor ?? "#64748b"}
            className="h-11 w-14 rounded-lg border border-border bg-surface"
          />
        </Field>
        <Field label="Tipo" htmlFor={`tipo-${etapa?.id ?? "novo"}`}>
          <Select id={`tipo-${etapa?.id ?? "novo"}`} name="tipo" defaultValue={etapa?.tipo ?? "PIPELINE"} className="w-44">
            <option value="PIPELINE">Pipeline (normal)</option>
            <option value="TERMINAL_GANHO">Terminal — Cliente Ativo</option>
            <option value="TERMINAL_PERDIDO">Terminal — Perdido</option>
            <option value="PARKING">Em espera</option>
          </Select>
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
