"use client";

import { useTransition } from "react";
import { apagarContaBancaria } from "@/lib/actions/extratos";
import { Button } from "@/components/ui/Button";

export function DeleteContaBancariaButton({
  contaId,
  companyId,
}: {
  contaId: string;
  companyId: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      loading={pending}
      className="text-xs text-danger"
      onClick={() => {
        if (!confirm("Remover esta conta e todos os extratos mensais dela?")) return;
        startTransition(() => apagarContaBancaria(contaId, companyId));
      }}
    >
      Remover conta
    </Button>
  );
}
