"use client";

import { useState, useTransition } from "react";
import { inativarEmpresaDoProcesso } from "@/lib/actions/legalizacao-processos";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

// Nunca automático — inativar impacta emissão de nota e outras coisas, então
// exige um clique explícito mesmo com o Encerramento 100% concluído.
export function InativarEmpresaCard({ companyId, processoId }: { companyId: string; processoId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);

  if (feito) {
    return (
      <Card className="p-5">
        <Alert tone="success">Empresa inativada.</Alert>
      </Card>
    );
  }

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Encerramento concluído</h3>
        <p className="text-sm text-foreground/60">Inativar a empresa agora? Isso impede emissão de novas notas.</p>
      </div>
      <div className="flex items-center gap-3">
        {error && <span className="text-xs text-danger">{error}</span>}
        <Button
          variant="danger"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              try {
                await inativarEmpresaDoProcesso(companyId, processoId);
                setFeito(true);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Não foi possível inativar.");
              }
            })
          }
        >
          Inativar empresa
        </Button>
      </div>
    </Card>
  );
}
