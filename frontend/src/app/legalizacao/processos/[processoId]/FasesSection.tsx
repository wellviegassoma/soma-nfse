"use client";

import { useRef, useState, useTransition } from "react";
import { adicionarFaseProcesso, removerFaseProcesso } from "@/lib/actions/legalizacao-processos";
import { FaseRow, type Fase } from "@/app/legalizacao/processos/ProcessosTable";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function FasesSection({
  processoId,
  prazoFinalProcesso,
  fases,
  podeEditar,
  responsaveis,
}: {
  processoId: string;
  prazoFinalProcesso: string | null;
  fases: Fase[];
  podeEditar: boolean;
  responsaveis: { id: string; full_name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex flex-col gap-3">
      {fases.length === 0 ? (
        <p className="text-sm text-foreground/50">Nenhuma fase nesse processo.</p>
      ) : (
        fases.map((fase) => (
          <FaseRow
            key={fase.id}
            fase={fase}
            processoId={processoId}
            prazoFinalProcesso={prazoFinalProcesso}
            podeEditar={podeEditar}
            responsaveis={responsaveis}
            onRemover={
              podeEditar
                ? () => {
                    if (!confirm(`Remover a fase "${fase.nome}" desse processo?`)) return;
                    startTransition(() => removerFaseProcesso(fase.id, processoId));
                  }
                : undefined
            }
          />
        ))
      )}

      {podeEditar && (
        <form
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const nome = new FormData(e.currentTarget).get("nome");
            if (typeof nome !== "string" || nome.trim().length < 2) return;
            startTransition(async () => {
              try {
                await adicionarFaseProcesso(processoId, nome);
                formRef.current?.reset();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Não foi possível adicionar.");
              }
            });
          }}
          className="mt-2 flex items-center gap-2 border-t border-border pt-3"
        >
          <Input name="nome" placeholder="Adicionar fase específica deste processo..." className="max-w-sm" />
          <Button type="submit" variant="secondary" loading={pending}>
            Adicionar
          </Button>
        </form>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
