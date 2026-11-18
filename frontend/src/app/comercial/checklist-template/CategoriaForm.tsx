"use client";

import { useState, useRef, useTransition } from "react";
import { salvarChecklistCategoria } from "@/lib/actions/comercial";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";

type Categoria = { id: string; nome: string; ordem: number };

export function CategoriaForm({ categoria, compact }: { categoria?: Categoria; compact?: boolean }) {
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
      const resultado = await salvarChecklistCategoria(undefined, formData);
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
        {categoria && <input type="hidden" name="categoriaId" value={categoria.id} />}
        <Field label="Nome" htmlFor={`cat-nome-${categoria?.id ?? "nova"}`}>
          <Input id={`cat-nome-${categoria?.id ?? "nova"}`} name="nome" defaultValue={categoria?.nome} required className="w-56" />
        </Field>
        <Field label="Ordem" htmlFor={`cat-ordem-${categoria?.id ?? "nova"}`}>
          <Input
            id={`cat-ordem-${categoria?.id ?? "nova"}`}
            name="ordem"
            type="number"
            defaultValue={categoria?.ordem ?? 0}
            required
            className="w-20"
          />
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
