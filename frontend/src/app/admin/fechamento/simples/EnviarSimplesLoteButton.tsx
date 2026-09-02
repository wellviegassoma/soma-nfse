"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

const TENTATIVAS_POR_EMPRESA = 3;

type Empresa = { id: string; nome: string };

// Uma empresa por chamada (reaproveita a mesma rota do card individual,
// /integra-contador/simples/declarar) — mesmo padrão de
// EnviarMitLoteButton.tsx. Diferente do fluxo individual (que sempre
// simula antes de transmitir), o lote vai direto pra
// indicadorTransmissao:true — não existe simulação em lote, por isso o
// aviso de confirmação é mais explícito sobre isso.
export function EnviarSimplesLoteButton({ competencia, empresas }: { competencia: string; empresas: Empresa[] }) {
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
          const resposta = await fetch(`/admin/empresas/${empresa.id}/integra-contador/simples/declarar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ competencia, indicadorTransmissao: true, retificadora: false }),
          });
          const corpo = await resposta.json();
          sucesso = resposta.ok && Boolean(corpo.resultado?.idDeclaracao);
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
          Declarar e transmitir todas ({empresas.length})
        </Button>
      )}

      {confirmando && (
        <Alert tone="danger">
          <div className="flex flex-col gap-3">
            <span>
              Isso vai <strong>transmitir de verdade</strong> o PGDAS-D de{" "}
              <strong>{empresas.length} empresa(s)</strong> pra competência {competencia} — direto,
              sem simulação prévia por empresa, efeito legal real. Confirma?
            </span>
            <div className="flex gap-2">
              <Button variant="danger" loading={rodando} onClick={rodar}>
                Sim, transmitir todas
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
          {resumo.sucessos} empresa(s) declarada(s).
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
