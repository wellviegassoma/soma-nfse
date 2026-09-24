"use client";

import { useActionState, useRef, useEffect } from "react";
import { adicionarComentario } from "@/lib/actions/comercial";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

type Atividade = {
  id: string;
  tipo: string;
  corpo: string | null;
  created_at: string;
  autor: { full_name: string } | null;
};

const TIPO_LABEL: Record<string, string> = {
  COMENTARIO: "",
  MUDANCA_ETAPA: "🔀",
  CHECKLIST_ITEM: "☑",
  SISTEMA: "⚙",
};

export function AtividadeSection({
  prospectId,
  atividades,
  podeEditar,
}: {
  prospectId: string;
  atividades: Atividade[];
  podeEditar: boolean;
}) {
  const [state, formAction, pending] = useActionState(adicionarComentario, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <div className="flex flex-col gap-4">
      {podeEditar && (
        <form ref={formRef} action={formAction} className="flex flex-col gap-2">
          <input type="hidden" name="prospectId" value={prospectId} />
          {state?.error && <Alert tone="danger">{state.error}</Alert>}
          <textarea
            name="corpo"
            rows={2}
            placeholder="Escrever um comentário..."
            className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground outline-none transition-shadow focus:border-brand focus:ring-4 focus:ring-brand/15"
          />
          <div>
            <Button type="submit" variant="secondary" size="md" loading={pending}>
              Comentar
            </Button>
          </div>
        </form>
      )}

      <div className="flex flex-col gap-3">
        {atividades.length === 0 ? (
          <p className="text-sm text-foreground/50">Nenhuma atividade ainda.</p>
        ) : (
          atividades.map((atividade) => (
            <div key={atividade.id} className="text-sm">
              <div className="flex items-center gap-2 text-xs text-foreground/50">
                <span>{TIPO_LABEL[atividade.tipo]}</span>
                <span className="font-medium text-foreground/70">
                  {atividade.autor?.full_name ?? "Sistema"}
                </span>
                <span>·</span>
                <span>{new Date(atividade.created_at).toLocaleString("pt-BR")}</span>
              </div>
              {atividade.corpo && <p className="mt-0.5 text-foreground">{atividade.corpo}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
