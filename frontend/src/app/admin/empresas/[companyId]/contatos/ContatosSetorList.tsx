"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ContatoSetorForm } from "./ContatoSetorForm";
import { DeleteContatoSetorButton } from "./DeleteContatoSetorButton";

type ContatoSetor = {
  id: string;
  setor: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
};

export function ContatosSetorList({ companyId, contatos }: { companyId: string; contatos: ContatoSetor[] }) {
  const [editandoId, setEditandoId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {contatos.map((contato) => (
        <Card key={contato.id} className="overflow-hidden">
          {editandoId === contato.id ? (
            <div className="p-4">
              <ContatoSetorForm companyId={companyId} contato={contato} onSaved={() => setEditandoId(null)} />
              <button
                type="button"
                className="mt-2 text-xs text-foreground/50 underline"
                onClick={() => setEditandoId(null)}
              >
                Cancelar edição
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">{contato.setor}</div>
                <div className="text-xs text-foreground/50">
                  {[contato.nome, contato.telefone, contato.email].filter(Boolean).join(" · ") || "Sem dados"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  className="h-8 px-2.5 text-xs"
                  onClick={() => setEditandoId(contato.id)}
                >
                  Editar
                </Button>
                <DeleteContatoSetorButton contatoId={contato.id} companyId={companyId} />
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
