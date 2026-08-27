"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { criarTipoDocumento } from "@/lib/actions/legalizacao";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";

export function NovoTipoDocumentoForm() {
  const [state, formAction, pending] = useActionState(criarTipoDocumento, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [aplicaATodas, setAplicaATodas] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!state?.success) return;
    const eraRestrito = !aplicaATodas;
    formRef.current?.reset();
    // Tipo restrito recém-criado ainda não se aplica a ninguém — manda
    // direto pra tela de selecionar as empresas em vez de deixar
    // "invisível" até alguém lembrar de configurar.
    if (state.tipoId && eraRestrito) {
      router.push(`/legalizacao/tipos/${state.tipoId}/empresas`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onReset={() => setAplicaATodas(true)}
      className="flex flex-col gap-3"
    >
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <div className="flex flex-wrap items-end gap-3">
        <Input name="nome" placeholder="Ex.: Licença Ambiental" required className="w-64" />
        <Button type="submit" variant="secondary" loading={pending}>
          + Adicionar tipo
        </Button>
      </div>
      <label className="flex items-center gap-2 text-xs text-foreground/70">
        <input
          type="checkbox"
          name="aplicaATodas"
          checked={aplicaATodas}
          onChange={(e) => setAplicaATodas(e.target.checked)}
          className="h-4 w-4 rounded border-border accent-brand"
        />
        Aplica a todas as empresas por padrão
      </label>
      {!aplicaATodas && (
        <p className="text-xs text-foreground/50">
          Desmarcado: o tipo não se aplica a nenhuma empresa até você escolher quais precisam
          dele — depois de criar, você já vai direto pra essa seleção.
        </p>
      )}
    </form>
  );
}
