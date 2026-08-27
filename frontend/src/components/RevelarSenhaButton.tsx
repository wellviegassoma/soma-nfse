"use client";

import { useState, useTransition } from "react";
import { revelarSenhaCofre } from "@/lib/actions/senhas-cofre";
import { Button } from "@/components/ui/Button";

export function RevelarSenhaButton({ senhaId, companyId }: { senhaId: string; companyId: string }) {
  const [senha, setSenha] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (senha !== null) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <code className="rounded bg-surface-muted px-2 py-1 font-mono text-foreground">{senha}</code>
        <Button
          type="button"
          variant="ghost"
          size="md"
          className="h-7 px-2.5 text-xs"
          onClick={() => setSenha(null)}
        >
          Esconder
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="md"
        className="h-7 px-2.5 text-xs"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await revelarSenhaCofre(senhaId, companyId);
            if (result.error) setError(result.error);
            else setSenha(result.senha ?? "");
          })
        }
      >
        Revelar
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
