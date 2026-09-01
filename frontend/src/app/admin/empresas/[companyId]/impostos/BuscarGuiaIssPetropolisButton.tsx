"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function BuscarGuiaIssPetropolisButton({
  companyId,
  competencia,
  faturamentoSoma,
}: {
  companyId: string;
  competencia: string;
  // Faturamento da competência já registrado no SOMA (notas), pra
  // conferir contra o valor de serviços que a Prefeitura usou como base
  // de cálculo da guia.
  faturamentoSoma: number;
}) {
  const [pending, setPending] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [conferencia, setConferencia] = useState<{
    valorServicos: number;
    valorIss: number;
  } | null>(null);

  async function buscar() {
    setPending(true);
    setErro(null);
    setConferencia(null);
    try {
      const resp = await fetch(
        `/admin/empresas/${companyId}/impostos/guia-iss-petropolis?competencia=${competencia}`,
      );
      if (!resp.ok) {
        const corpo = await resp.json().catch(() => null);
        setErro(corpo?.error || "Não foi possível buscar a guia de ISS agora.");
        return;
      }

      const valorServicos = Number(resp.headers.get("X-Valor-Servicos") ?? "");
      const valorIss = Number(resp.headers.get("X-Valor-Iss") ?? "");
      if (!Number.isNaN(valorServicos) && !Number.isNaN(valorIss)) {
        setConferencia({ valorServicos, valorIss });
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

  const diferenca = conferencia ? conferencia.valorServicos - faturamentoSoma : null;
  const bate = diferenca != null && Math.abs(diferenca) < 0.01;

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="secondary" loading={pending} onClick={buscar}>
        Buscar guia de ISS (Petrópolis)
      </Button>
      {erro && <Alert tone="danger">{erro}</Alert>}
      {conferencia && (
        <Alert tone={bate ? "success" : "warning"}>
          <div className="flex flex-col gap-1">
            <div>Base de cálculo na Prefeitura: {formatMoney(conferencia.valorServicos)}</div>
            <div>Faturamento no SOMA (notas): {formatMoney(faturamentoSoma)}</div>
            <div className="font-semibold">
              {bate
                ? "Os valores batem."
                : `Diferença: ${formatMoney(diferenca ?? 0)}`}
            </div>
            <div className="text-xs text-foreground/50">
              ISS da guia: {formatMoney(conferencia.valorIss)}
            </div>
          </div>
        </Alert>
      )}
    </div>
  );
}
