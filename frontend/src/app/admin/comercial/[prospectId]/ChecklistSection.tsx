"use client";

import { useState, useTransition } from "react";
import { marcarChecklistItem } from "@/lib/actions/comercial";

type Item = {
  id: string;
  categoria_nome: string;
  categoria_ordem: number;
  item_descricao: string;
  item_ordem: number;
  concluido: boolean;
};

export function ChecklistSection({
  prospectId,
  itens,
  podeEditar,
}: {
  prospectId: string;
  itens: Item[];
  podeEditar: boolean;
}) {
  const [, startTransition] = useTransition();
  const [otimista, setOtimista] = useState<Record<string, boolean>>({});

  if (itens.length === 0) {
    return <p className="text-sm text-foreground/50">Nenhum item de checklist nesse prospect.</p>;
  }

  const categorias = new Map<string, Item[]>();
  for (const item of itens) {
    const lista = categorias.get(item.categoria_nome) ?? [];
    lista.push(item);
    categorias.set(item.categoria_nome, lista);
  }

  const concluidos = itens.filter((i) => otimista[i.id] ?? i.concluido).length;

  function toggle(item: Item, concluido: boolean) {
    setOtimista((prev) => ({ ...prev, [item.id]: concluido }));
    startTransition(() => {
      marcarChecklistItem(item.id, prospectId, concluido).catch(() => {
        setOtimista((prev) => ({ ...prev, [item.id]: item.concluido }));
      });
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-foreground/50">
        {concluidos}/{itens.length} concluídos ({Math.round((concluidos / itens.length) * 100)}%)
      </p>
      {[...categorias.entries()].map(([categoria, lista]) => (
        <div key={categoria}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/50">{categoria}</h3>
          <div className="flex flex-col gap-1.5">
            {lista.map((item) => {
              const marcado = otimista[item.id] ?? item.concluido;
              return (
                <label key={item.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={marcado}
                    disabled={!podeEditar}
                    onChange={(e) => toggle(item, e.target.checked)}
                    className="h-4 w-4 rounded border-border accent-brand disabled:opacity-50"
                  />
                  <span className={marcado ? "text-foreground/40 line-through" : "text-foreground"}>
                    {item.item_descricao}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
