"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { semearCobrancaPadrao } from "@/lib/actions/financeiro-cobranca";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export function AtivarCobrancaButton({ companyId }: { companyId: string }) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col gap-3">
      {erro && <Alert tone="danger">{erro}</Alert>}
      <Button
        type="button"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await semearCobrancaPadrao(companyId);
            if (r.error) {
              setErro(r.error);
              return;
            }
            setErro(null);
            router.refresh();
          })
        }
      >
        Criar régua padrão
      </Button>
    </div>
  );
}
