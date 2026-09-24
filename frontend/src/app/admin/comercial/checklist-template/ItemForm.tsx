"use client";

import { useState, useRef, useTransition } from "react";
import { salvarChecklistItem } from "@/lib/actions/comercial";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";

type Item = { id: string; descricao: string; ordem: number };

export function ItemForm({
  categoriaId,
  item,
  compact,
}: {
  categoriaId: string;
  item?: Item;
  compact?: boolean;
}) {
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
      const resultado = await salvarChecklistItem(undefined, formData);
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
      <form ref={formRef} onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="categoriaId" value={categoriaId} />
        {item && <input type="hidden" name="itemId" value={item.id} />}
        <Input name="descricao" placeholder="Descrição do item" defaultValue={item?.descricao} required className="w-72" />
        <Input name="ordem" type="number" defaultValue={item?.ordem ?? 0} required className="w-20" />
        <Button type="submit" variant="secondary" size="md" loading={pending}>
          {item ? "Salvar" : "+ Adicionar item"}
        </Button>
        {compact && (
          <Button type="button" variant="ghost" size="md" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
        )}
      </form>
    </div>
  );
}
