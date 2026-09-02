"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Resumo = { valorServicos: number; valorIss: number };
type Pendente = { tipo: "pendente"; resumo: Resumo };
type Baixada = { tipo: "baixada"; resumo: Resumo };
type Estado = Pendente | Baixada | null;

function baixarBlob(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

function lerResumoDosHeaders(headers: Headers): Resumo | null {
  const valorServicos = Number(headers.get("X-Valor-Servicos") ?? "");
  const valorIss = Number(headers.get("X-Valor-Iss") ?? "");
  if (Number.isNaN(valorServicos) || Number.isNaN(valorIss)) return null;
  return { valorServicos, valorIss };
}

export function BuscarGuiaIssPetropolisButton({
  companyId,
  competencia,
  faturamentoSoma,
}: {
  companyId: string;
  competencia: string;
  // Faturamento da competência já registrado no SOMA (notas), pra
  // conferir contra o valor de serviços que a Prefeitura tem lançado.
  faturamentoSoma: number;
}) {
  const [pending, setPending] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>(null);

  async function buscar() {
    setPending(true);
    setErro(null);
    setEstado(null);
    try {
      const resp = await fetch(
        `/admin/empresas/${companyId}/impostos/guia-iss-petropolis?competencia=${competencia}`,
      );
      if (!resp.ok) {
        const corpo = await resp.json().catch(() => null);
        setErro(corpo?.error || "Não foi possível buscar a guia de ISS agora.");
        return;
      }

      if ((resp.headers.get("content-type") ?? "").includes("application/json")) {
        const corpo = await resp.json();
        if (corpo.consolidado === false) {
          setEstado({
            tipo: "pendente",
            resumo: { valorServicos: corpo.valor_servicos, valorIss: corpo.valor_iss },
          });
        } else {
          setErro("Resposta inesperada do servidor.");
        }
        return;
      }

      const resumo = lerResumoDosHeaders(resp.headers);
      const blob = await resp.blob();
      baixarBlob(blob, `guia-iss-petropolis-${competencia}.pdf`);
      if (resumo) setEstado({ tipo: "baixada", resumo });
    } catch {
      setErro("Não foi possível buscar a guia de ISS agora.");
    } finally {
      setPending(false);
    }
  }

  async function confirmarConsolidacao() {
    setPending(true);
    setErro(null);
    try {
      const resp = await fetch(
        `/admin/empresas/${companyId}/impostos/consolidar-guia-iss-petropolis`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ competencia }),
        },
      );
      if (!resp.ok) {
        const corpo = await resp.json().catch(() => null);
        setErro(corpo?.error || "Não foi possível consolidar e gerar a guia agora.");
        return;
      }
      const resumo = lerResumoDosHeaders(resp.headers);
      const blob = await resp.blob();
      baixarBlob(blob, `guia-iss-petropolis-${competencia}.pdf`);
      if (resumo) setEstado({ tipo: "baixada", resumo });
    } catch {
      setErro("Não foi possível consolidar e gerar a guia agora.");
    } finally {
      setPending(false);
    }
  }

  function linhasConferencia(resumo: Resumo) {
    const diferenca = resumo.valorServicos - faturamentoSoma;
    const bate = Math.abs(diferenca) < 0.01;
    return { diferenca, bate };
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="secondary" loading={pending} onClick={buscar}>
        Buscar guia de ISS (Petrópolis)
      </Button>
      {erro && <Alert tone="danger">{erro}</Alert>}

      {estado?.tipo === "pendente" &&
        (() => {
          const { diferenca, bate } = linhasConferencia(estado.resumo);
          return (
            <Alert tone={bate ? "success" : "warning"}>
              <div className="flex flex-col gap-2">
                <div className="font-semibold">Período ainda não consolidado na Prefeitura.</div>
                <div>Valor de serviços lançado até agora: {formatMoney(estado.resumo.valorServicos)}</div>
                <div>Faturamento no SOMA (notas): {formatMoney(faturamentoSoma)}</div>
                <div className="font-semibold">
                  {bate ? "Os valores batem." : `Diferença: ${formatMoney(diferenca)}`}
                </div>
                <div className="text-xs text-foreground/50">
                  ISS estimado: {formatMoney(estado.resumo.valorIss)}
                </div>
                <Button type="button" loading={pending} onClick={confirmarConsolidacao}>
                  Confirmar: consolidar período e gerar guia
                </Button>
                <div className="text-xs text-foreground/50">
                  Isso fecha o movimento econômico do mês na Prefeitura — depois só dá pra
                  retificar ou desconsolidar todo o período, não desfazer direto.
                </div>
              </div>
            </Alert>
          );
        })()}

      {estado?.tipo === "baixada" &&
        (() => {
          const { diferenca, bate } = linhasConferencia(estado.resumo);
          return (
            <Alert tone={bate ? "success" : "warning"}>
              <div className="flex flex-col gap-1">
                <div>Base de cálculo na Prefeitura: {formatMoney(estado.resumo.valorServicos)}</div>
                <div>Faturamento no SOMA (notas): {formatMoney(faturamentoSoma)}</div>
                <div className="font-semibold">
                  {bate ? "Os valores batem." : `Diferença: ${formatMoney(diferenca)}`}
                </div>
                <div className="text-xs text-foreground/50">
                  ISS da guia: {formatMoney(estado.resumo.valorIss)}
                </div>
              </div>
            </Alert>
          );
        })()}
    </div>
  );
}
