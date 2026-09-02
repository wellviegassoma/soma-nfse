"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { abrirPdfBase64 } from "@/lib/pdf-base64";
import type { ValoresDevidosMit } from "@/lib/calculo-impostos";

const POLL_INTERVALO_MS = 10_000;
const POLL_MAX_TENTATIVAS = 12; // ~2 minutos

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type SituacaoMit = {
  idApuracao: number | null;
  situacaoApuracao: number | null;
  textoSituacao: string | null;
  dataEncerramento: string | null;
};

// Sem "simular sem efeito": diferente do PGDAS-D, todo ENCAPURACAO314 já
// cria (ou sobrescreve) uma apuração de verdade — não existe modo
// read-only. Por isso o fluxo é mais direto, mas com a mesma seriedade na
// confirmação antes de encerrar.
export function DeclararMitCard({
  companyId,
  competencia,
  valoresDevidos,
  encerramentoExistente,
}: {
  companyId: string;
  competencia: string; // "YYYY-MM"
  valoresDevidos: ValoresDevidosMit;
  // Já encerrado antes (histórico próprio, Fase U) — sobrevive a um
  // refresh da página, diferente do estado em memória do componente.
  encerramentoExistente: { protocolo: string; textoSituacao: string | null } | null;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [declarando, setDeclarando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [protocolo, setProtocolo] = useState<string | null>(encerramentoExistente?.protocolo ?? null);
  const [situacao, setSituacao] = useState<SituacaoMit | null>(
    encerramentoExistente
      ? {
          idApuracao: null,
          situacaoApuracao: null,
          textoSituacao: encerramentoExistente.textoSituacao,
          dataEncerramento: null,
        }
      : null,
  );
  const [poluindoDemais, setPolluindoDemais] = useState(false);
  const [baixandoGuia, setBaixandoGuia] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nadaADeclarar =
    valoresDevidos.irpj === 0 && valoresDevidos.csll === 0 && valoresDevidos.pis === 0 && valoresDevidos.cofins === 0;
  const encerrada = situacao?.textoSituacao === "ENCERRADA";
  const [ano, mes] = competencia.split("-");

  useEffect(() => {
    // Retoma o polling se a página recarregou no meio de um encerramento
    // ainda não confirmado.
    if (protocolo && situacao?.textoSituacao !== "ENCERRADA") {
      consultarSituacao(protocolo, 1);
    }
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function consultarSituacao(prot: string, tentativa: number) {
    try {
      const resposta = await fetch(`/admin/empresas/${companyId}/integra-contador/mit/situacao/${prot}`);
      const corpo = await resposta.json();
      if (!resposta.ok) {
        setErro(corpo.error ?? "Não foi possível consultar a situação do encerramento.");
        return;
      }
      setSituacao(corpo);
      if (corpo.textoSituacao === "ENCERRADA") return;
    } catch {
      setErro("Não foi possível falar com o Integra Contador agora.");
      return;
    }
    if (tentativa >= POLL_MAX_TENTATIVAS) {
      setPolluindoDemais(true);
      return;
    }
    pollRef.current = setTimeout(() => consultarSituacao(prot, tentativa + 1), POLL_INTERVALO_MS);
  }

  async function encerrarApuracao() {
    setDeclarando(true);
    setErro(null);
    setSituacao(null);
    setPolluindoDemais(false);
    try {
      const resposta = await fetch(`/admin/empresas/${companyId}/integra-contador/mit/declarar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competencia, transmissaoImediata: false }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok) {
        setErro(corpo.error ?? "Não foi possível encerrar a apuração.");
        return;
      }
      setProtocolo(corpo.protocoloEncerramento);
      if (corpo.protocoloEncerramento) {
        consultarSituacao(corpo.protocoloEncerramento, 1);
      }
    } catch {
      setErro("Não foi possível falar com o Integra Contador agora. Tente novamente.");
    } finally {
      setDeclarando(false);
      setConfirmando(false);
    }
  }

  async function baixarGuia() {
    setBaixandoGuia(true);
    setErro(null);
    try {
      const resposta = await fetch(`/admin/empresas/${companyId}/integra-contador/mit/guia/${ano}/${mes}`);
      const corpo = await resposta.json();
      if (!resposta.ok) {
        setErro(corpo.error ?? "Não foi possível gerar a guia.");
        return;
      }
      abrirPdfBase64(corpo.pdf, `guia-mit-${competencia}.pdf`);
    } catch {
      setErro("Não foi possível falar com o Integra Contador agora. Tente novamente.");
    } finally {
      setBaixandoGuia(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">
        MIT — Módulo de Inclusão de Tributos (IRPJ/CSLL/PIS/COFINS)
      </div>

      <div className="flex flex-col gap-4 p-5">
        <p className="text-xs text-foreground/50">
          Encerrar a apuração transmite oficialmente os débitos abaixo pra Receita Federal — efeito
          legal real. Diferente do PGDAS-D, o MIT não tem modo de simulação: encerrar já cria (ou
          sobrescreve, se ainda estiver em edição) a apuração desse período.
        </p>

        <div className="flex flex-col gap-1 rounded-lg border border-border p-4 text-sm">
          {[
            { label: "IRPJ", valor: valoresDevidos.irpj },
            { label: "CSLL", valor: valoresDevidos.csll },
            { label: "PIS", valor: valoresDevidos.pis },
            { label: "COFINS", valor: valoresDevidos.cofins },
          ].map((linha) => (
            <div key={linha.label} className="flex items-center justify-between">
              <span className="text-foreground/70">{linha.label}</span>
              <span className="font-medium text-foreground">{formatMoney(linha.valor)}</span>
            </div>
          ))}
        </div>

        {nadaADeclarar && (
          <Alert tone="warning">
            Nada devido nesse período — encerrar mesmo assim vai declarar como &quot;sem
            movimento&quot;.
          </Alert>
        )}

        {erro && <Alert tone="danger">{erro}</Alert>}

        {!protocolo && !confirmando && (
          <Button variant="danger" className="self-start" onClick={() => setConfirmando(true)}>
            Encerrar apuração do MIT
          </Button>
        )}

        {confirmando && (
          <Alert tone="danger">
            <div className="flex flex-col gap-3">
              <span>
                Isso vai <strong>encerrar oficialmente</strong> a apuração do MIT pra competência{" "}
                {competencia} — efeito legal real. Confirma?
              </span>
              <div className="flex gap-2">
                <Button variant="danger" loading={declarando} onClick={encerrarApuracao}>
                  Sim, encerrar
                </Button>
                <Button variant="ghost" onClick={() => setConfirmando(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          </Alert>
        )}

        {protocolo && (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-muted p-4 text-sm">
            <span className="text-foreground/70">Protocolo de encerramento: {protocolo}</span>
            {!encerrada && !poluindoDemais && (
              <span className="text-foreground/50">
                Aguardando confirmação da Receita
                {situacao?.textoSituacao ? ` (${situacao.textoSituacao})` : "..."} — a apuração é
                enviada pra DCTFWeb de forma assíncrona, isso pode levar alguns minutos.
              </span>
            )}
            {poluindoDemais && !encerrada && (
              <span className="text-foreground/50">
                Ainda não confirmou depois de alguns minutos — pode fechar essa tela e conferir
                depois, o encerramento continua em andamento do lado da Receita.
              </span>
            )}
            {encerrada && (
              <>
                <span className="font-medium text-foreground">
                  Encerrada{situacao?.dataEncerramento ? ` em ${situacao.dataEncerramento}` : ""}.
                </span>
                <Button variant="secondary" size="md" loading={baixandoGuia} onClick={baixarGuia} className="self-start">
                  Baixar guia (DARF)
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
