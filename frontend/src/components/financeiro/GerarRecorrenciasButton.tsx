"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { gerarRecorrenciasAgora } from "@/lib/actions/financeiro-lancamentos";
import { Button } from "@/components/ui/Button";

/**
 * Botão de escape: normalmente o cron diário já mantém o horizonte cheio, mas
 * depois de mudar uma recorrência o usuário quer ver o efeito na hora.
 */
export function GerarRecorrenciasButton({ companyId }: { companyId: string }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="secondary"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await gerarRecorrenciasAgora(companyId);
            setMsg(
              r.error
                ? r.error
                : r.criados
                  ? `${r.criados} lançamento(s) gerado(s).`
                  : "Já estava tudo gerado.",
            );
            router.refresh();
          })
        }
      >
        Gerar agora
      </Button>
      {msg && <span className="text-xs text-foreground/60">{msg}</span>}
    </div>
  );
}
