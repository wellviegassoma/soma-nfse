"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

const TENTATIVAS_POR_EMPRESA = 3;

type Empresa = { id: string; nome: string };

// Mesmo padrão de EnviarMitLoteButton.tsx (uma empresa por chamada,
// retry por empresa), mas sem efeito legal — é só uma consulta de
// leitura (Situação Fiscal via Integra Contador). O aviso de
// confirmação é sobre CUSTO, não sobre efeito jurídico: consultar de
// novo no mesmo dia já vem do cache do próprio serviço integra-contador
// sem gerar chamada nova, então só as empresas sem cache das últimas 24h
// (informado pelo servidor em `semCacheHoje`) geram chamada paga de
// verdade.
export function ConsultarSituacaoFiscalLoteButton({
  empresas,
  semCacheHoje,
}: {
  empresas: Empresa[];
  semCacheHoje: number;
}) {
  const router = useRouter();
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
          const resposta = await fetch(`/admin/empresas/${empresa.id}/integra-contador/situacao-fiscal`);
          sucesso = resposta.ok && resposta.headers.get("Content-Type") === "application/pdf";
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
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {!confirmando && (
        <Button
          type="button"
          variant="primary"
          loading={rodando}
          onClick={() => setConfirmando(true)}
          disabled={empresas.length === 0}
        >
          Consultar situação fiscal de todas ({empresas.length})
        </Button>
      )}

      {confirmando && (
        <Alert tone="warning">
          <div className="flex flex-col gap-3">
            <span>
              Isso vai consultar a Situação Fiscal de <strong>{empresas.length} empresa(s)</strong>.{" "}
              {semCacheHoje > 0
                ? `${semCacheHoje} delas não têm cache das últimas 24h e vão gerar chamada nova (paga) ao Integra Contador.`
                : "Todas já têm cache das últimas 24h — não deve gerar chamada paga agora."}{" "}
              Confirma?
            </span>
            <div className="flex gap-2">
              <Button variant="primary" loading={rodando} onClick={rodar}>
                Sim, consultar todas
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
          {resumo.sucessos} empresa(s) consultada(s).
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
