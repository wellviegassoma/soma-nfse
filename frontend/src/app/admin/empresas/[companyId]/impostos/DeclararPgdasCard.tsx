"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

type ValorDevido = { codigoTributo: number; valor: number };

type DeclaracaoTransmitida = {
  idDeclaracao?: string;
  dataHoraTransmissao?: string;
  valoresDevidos?: ValorDevido[];
  declaracao?: string; // PDF base64
  recibo?: string; // PDF base64
  darf?: string; // PDF base64
};

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function abrirPdfBase64(base64: string, nomeArquivo: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.download = nomeArquivo;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// Fluxo em 2 passos, cada um com efeito bem diferente:
// 1. "Simular" (indicadorTransmissao=false) — pede pra Serpro calcular os
//    valores, sem nenhum efeito legal. Sempre disponível.
// 2. "Transmitir de verdade" (indicadorTransmissao=true) — só habilita
//    depois de uma simulação bem-sucedida, e atrás de uma segunda
//    confirmação explícita: é uma ação real e irreversível (só se
//    corrige depois com retificadora).
export function DeclararPgdasCard({
  companyId,
  competencia,
  bloqueios,
}: {
  companyId: string;
  competencia: string;
  bloqueios: string[];
}) {
  const [carregando, setCarregando] = useState<"simular" | "transmitir" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [simulado, setSimulado] = useState<DeclaracaoTransmitida | null>(null);
  const [transmitido, setTransmitido] = useState<DeclaracaoTransmitida | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  async function chamar(indicadorTransmissao: boolean) {
    setCarregando(indicadorTransmissao ? "transmitir" : "simular");
    setErro(null);
    try {
      const resposta = await fetch(
        `/admin/empresas/${companyId}/integra-contador/simples/declarar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ competencia, indicadorTransmissao }),
        },
      );
      const corpo = await resposta.json();
      if (!resposta.ok) {
        setErro(corpo.error ?? "Não foi possível processar a declaração.");
        return;
      }
      const resultado: DeclaracaoTransmitida | null = corpo.resultado ?? null;
      if (indicadorTransmissao) {
        setTransmitido(resultado);
      } else {
        setSimulado(resultado);
      }
    } catch {
      setErro("Não foi possível falar com o Integra Contador agora. Tente novamente.");
    } finally {
      setCarregando(null);
      setConfirmando(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">
        Declaração do PGDAS-D (TRANSDECLARACAO11)
      </div>

      {bloqueios.length > 0 ? (
        <div className="flex flex-col gap-2 p-5">
          <Alert tone="warning">
            Não dá pra declarar essa competência ainda — resolva antes:
          </Alert>
          <ul className="list-disc pl-5 text-sm text-foreground/70">
            {bloqueios.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-5">
          <p className="text-xs text-foreground/50">
            Simular pede pra Receita calcular os valores devidos, sem nenhum efeito legal — é
            seguro repetir quantas vezes quiser. Transmitir é definitivo: uma vez enviado, só se
            corrige com retificadora.
          </p>

          {erro && <Alert tone="danger">{erro}</Alert>}

          {transmitido ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-muted p-4 text-sm">
              <div className="font-semibold text-foreground">
                Declaração transmitida{transmitido.dataHoraTransmissao ? ` em ${transmitido.dataHoraTransmissao}` : ""}.
              </div>
              {transmitido.valoresDevidos && transmitido.valoresDevidos.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {transmitido.valoresDevidos.map((v) => (
                    <li key={v.codigoTributo} className="flex justify-between">
                      <span className="text-foreground/60">Tributo {v.codigoTributo}</span>
                      <span className="font-medium">{formatMoney(v.valor)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                {transmitido.declaracao && (
                  <Button variant="secondary" size="md" onClick={() => abrirPdfBase64(transmitido.declaracao!, `declaracao-${competencia}.pdf`)}>
                    Baixar declaração
                  </Button>
                )}
                {transmitido.recibo && (
                  <Button variant="secondary" size="md" onClick={() => abrirPdfBase64(transmitido.recibo!, `recibo-${competencia}.pdf`)}>
                    Baixar recibo
                  </Button>
                )}
                {transmitido.darf && (
                  <Button variant="secondary" size="md" onClick={() => abrirPdfBase64(transmitido.darf!, `darf-${competencia}.pdf`)}>
                    Baixar DARF
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <>
              {simulado && (
                <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-muted p-4 text-sm">
                  <div className="font-semibold text-foreground">Valores calculados pela Receita (simulação):</div>
                  {simulado.valoresDevidos && simulado.valoresDevidos.length > 0 ? (
                    <ul className="flex flex-col gap-1">
                      {simulado.valoresDevidos.map((v) => (
                        <li key={v.codigoTributo} className="flex justify-between">
                          <span className="text-foreground/60">Tributo {v.codigoTributo}</span>
                          <span className="font-medium">{formatMoney(v.valor)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-foreground/50">Nenhum valor devido calculado.</span>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant={simulado ? "secondary" : "primary"}
                  loading={carregando === "simular"}
                  onClick={() => chamar(false)}
                >
                  {simulado ? "Simular de novo" : "Simular"}
                </Button>

                {simulado && !confirmando && (
                  <Button variant="danger" onClick={() => setConfirmando(true)}>
                    Transmitir de verdade
                  </Button>
                )}
              </div>

              {confirmando && (
                <Alert tone="danger">
                  <div className="flex flex-col gap-3">
                    <span>
                      Isso vai <strong>transmitir oficialmente</strong> a declaração do PGDAS-D pra
                      competência {competencia} — efeito legal real e irreversível (só se corrige
                      depois com retificadora). Confirma?
                    </span>
                    <div className="flex gap-2">
                      <Button variant="danger" loading={carregando === "transmitir"} onClick={() => chamar(true)}>
                        Sim, transmitir
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirmando(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                </Alert>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
