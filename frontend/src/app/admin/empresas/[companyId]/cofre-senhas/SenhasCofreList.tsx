"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { RevelarSenhaButton } from "@/components/RevelarSenhaButton";
import { SenhaCofreForm } from "./SenhaCofreForm";
import { DeleteSenhaCofreButton } from "./DeleteSenhaCofreButton";

type Senha = {
  id: string;
  servico: string;
  usuario: string | null;
  observacoes: string | null;
};

export function SenhasCofreList({ companyId, senhas }: { companyId: string; senhas: Senha[] }) {
  const [editandoId, setEditandoId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {senhas.map((senha) => (
        <Card key={senha.id} className="overflow-hidden">
          {editandoId === senha.id ? (
            <div className="p-4">
              <SenhaCofreForm companyId={companyId} senha={senha} onSaved={() => setEditandoId(null)} />
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
                <div className="text-sm font-semibold text-foreground">{senha.servico}</div>
                <div className="text-xs text-foreground/50">
                  {[senha.usuario, senha.observacoes].filter(Boolean).join(" · ") || "Sem observações"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <RevelarSenhaButton senhaId={senha.id} companyId={companyId} />
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  className="h-8 px-2.5 text-xs"
                  onClick={() => setEditandoId(senha.id)}
                >
                  Editar
                </Button>
                <DeleteSenhaCofreButton senhaId={senha.id} companyId={companyId} />
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
