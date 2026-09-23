"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Duas estruturas de guia confirmadas ao vivo no Nota Carioca — mesma
// distinção que `company.iss_tipo` já usa em resolverIssMensal
// (frontend/src/lib/calculo-impostos.ts): sociedade uniprofissional tem
// ISS fixo por profissional (sem relação com faturamento); regime
// percentual tem base de cálculo/valor de serviços pra conferir.
type ResumoFixo = { regime: "FIXO"; quantidadeProfissionais: number; valorIss: number | null };
type ResumoPercentual = {
  regime: "PERCENTUAL";
  valorServicos: number;
  baseCalculo: number | null;
  valorIss: number | null;
};
type Resumo = ResumoFixo | ResumoPercentual;

function lerResumoDosHeaders(headers: Headers): Resumo | null {
  const regime = headers.get("X-Regime");
  const valorIss = headers.get("X-Valor-Iss");
  const valorIssNum = valorIss ? Number(valorIss) : null;
  if (regime === "FIXO") {
    const quantidade = Number(headers.get("X-Quantidade-Profissionais") ?? "");
    if (Number.isNaN(quantidade)) return null;
    return { regime: "FIXO", quantidadeProfissionais: quantidade, valorIss: valorIssNum };
  }
  if (regime === "PERCENTUAL") {
    const valorServicos = Number(headers.get("X-Valor-Servicos") ?? "");
    if (Number.isNaN(valorServicos)) return null;
    const baseCalculo = headers.get("X-Base-Calculo");
    return {
      regime: "PERCENTUAL",
      valorServicos,
      baseCalculo: baseCalculo ? Number(baseCalculo) : null,
      valorIss: valorIssNum,
    };
  }
  return null;
}

export function BuscarGuiaIssButton({
  companyId,
  competencia,
  faturamentoSoma,
}: {
  companyId: string;
  competencia: string;
  // Só usado quando a guia vier no regime PERCENTUAL — no FIXO (sociedade
  // uniprofissional) o ISS não depende da receita, não há o que conferir.
  faturamentoSoma: number;
}) {
  const [pending, setPending] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resumo, setResumo] = useState<Resumo | null>(null);

  async function buscar() {
    setPending(true);
    setErro(null);
    setResumo(null);
    try {
      const resp = await fetch(
        `/admin/empresas/${companyId}/impostos/guia-iss?competencia=${competencia}`,
      );
      if (!resp.ok) {
        const corpo = await resp.json().catch(() => null);
        setErro(corpo?.error || "Não foi possível buscar a guia de ISS agora.");
        return;
      }
      const resumoLido = lerResumoDosHeaders(resp.headers);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `guia-iss-${competencia}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      if (resumoLido) setResumo(resumoLido);
    } catch {
      setErro("Não foi possível buscar a guia de ISS agora.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="secondary" loading={pending} onClick={buscar}>
        Buscar guia de ISS (Nota Carioca)
      </Button>
      {erro && <Alert tone="danger">{erro}</Alert>}

      {resumo?.regime === "FIXO" && (
        <Alert tone="success">
          <div className="flex flex-col gap-1">
            <div className="font-semibold">Sociedade uniprofissional — ISS fixo por profissional.</div>
            <div>Quantidade de profissionais na guia: {resumo.quantidadeProfissionais}</div>
            {resumo.valorIss != null && <div>Valor do ISS: {formatMoney(resumo.valorIss)}</div>}
            <div className="text-xs text-foreground/50">
              Não depende do faturamento — confira se a quantidade bate com o quadro real da
              empresa.
            </div>
          </div>
        </Alert>
      )}

      {resumo?.regime === "PERCENTUAL" &&
        (() => {
          const diferenca = resumo.valorServicos - faturamentoSoma;
          const bate = Math.abs(diferenca) < 0.01;
          return (
            <Alert tone={bate ? "success" : "warning"}>
              <div className="flex flex-col gap-1">
                <div>Valor de serviços na guia: {formatMoney(resumo.valorServicos)}</div>
                <div>Faturamento no SOMA (notas): {formatMoney(faturamentoSoma)}</div>
                <div className="font-semibold">
                  {bate ? "Os valores batem." : `Diferença: ${formatMoney(diferenca)}`}
                </div>
                {resumo.valorIss != null && (
                  <div className="text-xs text-foreground/50">
                    ISS da guia: {formatMoney(resumo.valorIss)}
                  </div>
                )}
              </div>
            </Alert>
          );
        })()}
    </div>
  );
}
