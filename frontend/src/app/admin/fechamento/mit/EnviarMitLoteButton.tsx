"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

const TENTATIVAS_POR_EMPRESA = 3;

type Empresa = { id: string; nome: string };

// Uma empresa por chamada (reaproveita a mesma rota do card individual,
// /integra-contador/mit/declarar) — mesmo padrão já usado em
// BuscarTodasButton/ExportarZipButton: nunca uma única requisição
// encerrando várias empresas em sequência, que estouraria o tempo limite
// do servidor. Retry por empresa, mesma disciplina do ExportarZipButton.
export function EnviarMitLoteButton({ competencia, empresas }: { competencia: string; empresas: Empresa[] }) {
  const [confirmando, setConfirmando] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [indice, setIndice] = useState(0);
  const [empresaAtual, setEmpresaAtual] = useState<string | null>(null);
  const [resumo, setResumo] = useState<{ sucessos: number; falhas: string[] } | null>(null);

  async function rodar() {
    setRodando(true);
    setResumo(null);
    let sucessos = 0;
    const falhas: string[] = [];

    for (let i = 0; i < empresas.length; i++) {
      const empresa = empresas[i];
      setIndice(i + 1);
      setEmpresaAtual(empresa.nome);

      let sucesso = false;
      for (let tentativa = 1; tentativa <= TENTATIVAS_POR_EMPRESA && !sucesso; tentativa++) {
        try {
          const resposta = await fetch(`/admin/empresas/${empresa.id}/integra-contador/mit/declarar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ competencia, transmissaoImediata: false }),
          });
          const corpo = await resposta.json();
          sucesso = resposta.ok && Boolean(corpo.protocoloEncerramento);
        } catch {
          sucesso = false;
        }
      }
      if (sucesso) sucessos += 1;
      else falhas.push(empresa.nome);
    }

    setResumo({ sucessos, falhas });
    setEmpresaAtual(null);
    setRodando(false);
    setConfirmando(false);
  }

  return (
    <div className="flex flex-col gap-2">
      {!confirmando && (
        <Button
          type="button"
          variant="danger"
          loading={rodando}
          onClick={() => setConfirmando(true)}
          disabled={empresas.length === 0}
        >
          Encerrar MIT de todas ({empresas.length})
        </Button>
      )}

      {confirmando && (
        <Alert tone="danger">
          <div className="flex flex-col gap-3">
            <span>
              Isso vai <strong>encerrar oficialmente</strong> a apuração do MIT de{" "}
              <strong>{empresas.length} empresa(s)</strong> pra competência {competencia} — efeito legal
              real, uma transmissão de verdade por empresa. Confirma?
            </span>
            <div className="flex gap-2">
              <Button variant="danger" loading={rodando} onClick={rodar}>
                Sim, encerrar todas
              </Button>
              <Button variant="ghost" onClick={() => setConfirmando(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </Alert>
      )}

      {rodando && (
        <p className="text-xs text-foreground/60">
          {indice}/{empresas.length} — {empresaAtual}
        </p>
      )}

      {resumo && (
        <Alert tone={resumo.falhas.length === 0 ? "success" : "warning"}>
          {resumo.sucessos} empresa(s) encerrada(s).
          {resumo.falhas.length > 0 && (
            <span className="mt-1 block">
              {resumo.falhas.length} com falha mesmo após {TENTATIVAS_POR_EMPRESA} tentativas:{" "}
              {resumo.falhas.join(", ")}.
            </span>
          )}
        </Alert>
      )}
    </div>
  );
}
