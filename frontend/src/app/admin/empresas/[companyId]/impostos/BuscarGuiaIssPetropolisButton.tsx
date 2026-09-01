"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export function BuscarGuiaIssPetropolisButton({
  companyId,
  competencia,
}: {
  companyId: string;
  competencia: string;
}) {
  const [pending, setPending] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function buscar() {
    setPending(true);
    setErro(null);
    try {
      const resp = await fetch(
        `/admin/empresas/${companyId}/impostos/guia-iss-petropolis?competencia=${competencia}`,
      );
      if (!resp.ok) {
        const corpo = await resp.json().catch(() => null);
        setErro(corpo?.error || "Não foi possível buscar a guia de ISS agora.");
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `guia-iss-petropolis-${competencia}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErro("Não foi possível buscar a guia de ISS agora.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="secondary" loading={pending} onClick={buscar}>
        Buscar guia de ISS (Petrópolis)
      </Button>
      {erro && <Alert tone="danger">{erro}</Alert>}
    </div>
  );
}
