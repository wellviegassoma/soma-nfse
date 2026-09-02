"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { abrirPdfBase64 } from "@/lib/pdf-base64";

type ValorDevido = { codigoTributo: number; valor: number };

type DeclaracaoTransmitida = {
  idDeclaracao?: string;
  dataHoraTransmissao?: string;
  valoresDevidos?: ValorDevido[];
  declaracao?: string; // PDF base64
  recibo?: string; // PDF base64
  darf?: string; // PDF base64
};

type ArquivoPdf = { nomeArquivo: string; pdf: string };

// Resposta de CONSULTIMADECREC14 — consulta a última declaração/recibo já
// transmitida direto na Serpro, funciona pra qualquer transmissão
// (aqui, antes desta feature existir, ou pelo PGDAS-D Web).
type ReciboConsultado = {
  numeroDeclaracao: string;
  recibo?: ArquivoPdf;
  declaracao?: ArquivoPdf;
  maed?: { nomeArquivoNotificacao?: string; pdfNotificacao?: string; nomeArquivoDarf?: string; pdfDarf?: string };
};

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
  const [consultandoRecibo, setConsultandoRecibo] = useState(false);
  const [erroRecibo, setErroRecibo] = useState<string | null>(null);
  const [reciboConsultado, setReciboConsultado] = useState<ReciboConsultado | null>(null);
  const [retificadora, setRetificadora] = useState(false);
  const periodoApuracao = competencia.replace("-", "");

  async function buscarReciboJaTransmitido() {
    setConsultandoRecibo(true);
    setErroRecibo(null);
    setReciboConsultado(null);
    try {
      const resposta = await fetch(
        `/admin/empresas/${companyId}/integra-contador/simples/recibo/${periodoApuracao}`,
      );
      const corpo = await resposta.json();
      if (!resposta.ok) {
        setErroRecibo(corpo.error ?? "Não foi possível consultar.");
        return;
      }
      setReciboConsultado(corpo.resultado);
    } catch {
      setErroRecibo("Não foi possível falar com o Integra Contador agora. Tente novamente.");
    } finally {
      setConsultandoRecibo(false);
    }
  }

  async function chamar(indicadorTransmissao: boolean) {
    setCarregando(indicadorTransmissao ? "transmitir" : "simular");
    setErro(null);
    try {
      const resposta = await fetch(
        `/admin/empresas/${companyId}/integra-contador/simples/declarar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ competencia, indicadorTransmissao, retificadora }),
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

          <label className="flex items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={retificadora}
              onChange={(e) => {
                setRetificadora(e.target.checked);
                setSimulado(null);
                setTransmitido(null);
                setConfirmando(false);
                setErro(null);
              }}
              className="mt-0.5 h-4 w-4 rounded border-border accent-brand"
            />
            <span>
              Já existe declaração transmitida pra essa competência — enviar como{" "}
              <strong>retificadora</strong> (usa os dados que estão no sistema agora, sem
              comparar com a declaração anterior). Deixe desmarcado pra declaração original.
            </span>
          </label>

          <a
            href={`/admin/empresas/${companyId}/integra-contador/simples/das/${periodoApuracao}`}
            target="_blank"
            rel="noopener noreferrer"
            className="self-start"
          >
            <Button variant="secondary" size="md">
              Baixar guia do DAS (pra enviar ao cliente)
            </Button>
          </a>
          <p className="-mt-2 text-xs text-foreground/40">
            Só funciona se essa competência já foi transmitida antes (aqui ou pelo PGDAS-D Web) —
            a Serpro recusa gerar guia de declaração inexistente.
          </p>

          <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-foreground">
                  Já foi declarado antes? Buscar declaração/recibo
                </div>
                <p className="text-xs text-foreground/50">
                  Consulta a última declaração já transmitida direto na Serpro (funciona mesmo
                  pra transmissão feita antes desta tela existir, ou pelo PGDAS-D Web). Guardado
                  por 180 dias sem custo — só paga uma consulta nova depois disso.
                </p>
              </div>
              <Button variant="secondary" loading={consultandoRecibo} onClick={buscarReciboJaTransmitido}>
                Buscar
              </Button>
            </div>
            {erroRecibo && <Alert tone="warning">{erroRecibo}</Alert>}
            {reciboConsultado && (
              <div className="flex flex-col gap-2 rounded-lg bg-surface-muted p-3 text-sm">
                <span className="text-foreground/70">
                  Declaração nº {reciboConsultado.numeroDeclaracao}
                </span>
                <div className="flex flex-wrap gap-2">
                  {reciboConsultado.declaracao?.pdf && (
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={() => abrirPdfBase64(reciboConsultado.declaracao!.pdf, reciboConsultado.declaracao!.nomeArquivo)}
                    >
                      Baixar declaração
                    </Button>
                  )}
                  {reciboConsultado.recibo?.pdf && (
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={() => abrirPdfBase64(reciboConsultado.recibo!.pdf, reciboConsultado.recibo!.nomeArquivo)}
                    >
                      Baixar recibo
                    </Button>
                  )}
                  {reciboConsultado.maed?.pdfNotificacao && (
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={() =>
                        abrirPdfBase64(
                          reciboConsultado.maed!.pdfNotificacao!,
                          reciboConsultado.maed!.nomeArquivoNotificacao ?? `maed-notificacao-${competencia}.pdf`,
                        )
                      }
                    >
                      Baixar notificação MAED
                    </Button>
                  )}
                  {reciboConsultado.maed?.pdfDarf && (
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={() =>
                        abrirPdfBase64(
                          reciboConsultado.maed!.pdfDarf!,
                          reciboConsultado.maed!.nomeArquivoDarf ?? `maed-darf-${competencia}.pdf`,
                        )
                      }
                    >
                      Baixar DARF da multa
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

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
                  <div className="font-semibold text-foreground">
                    Valores calculados pela Receita (simulação{retificadora ? " — retificadora" : ""}):
                  </div>
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
                    {retificadora ? "Transmitir retificadora de verdade" : "Transmitir de verdade"}
                  </Button>
                )}
              </div>

              {confirmando && (
                <Alert tone="danger">
                  <div className="flex flex-col gap-3">
                    <span>
                      Isso vai <strong>transmitir oficialmente</strong>{" "}
                      {retificadora ? (
                        <>
                          uma <strong>declaração retificadora</strong> do PGDAS-D
                        </>
                      ) : (
                        "a declaração do PGDAS-D"
                      )}{" "}
                      pra competência {competencia} — efeito legal real e irreversível
                      {!retificadora && " (só se corrige depois com retificadora)"}. Confirma?
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
