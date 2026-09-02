"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

const TENTATIVAS_POR_EMPRESA = 3;
// Rodar 149 empresas em sequência rápida tropeçou num rate-limit real da
// Serpro (erro "SUSPENDED" em ~22% do lote, mesmo com retry) — essas
// pausas dão tempo do limite da Serpro "esfriar" entre chamadas e entre
// tentativas da mesma empresa, sem mudar o payload nem a lógica.
const PAUSA_ENTRE_EMPRESAS_MS = 600;
const PAUSA_ENTRE_TENTATIVAS_MS = 1500;

type Empresa = { id: string; nome: string };

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mesmo padrão de ConsultarSituacaoFiscalLoteButton.tsx — aviso de CUSTO
// (não efeito legal), uma empresa por chamada, retry por empresa,
// router.refresh() no final pra recarregar a tabela com o que foi
// encontrado.
export function VerificarParcelamentosLoteButton({
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
  const [totalRodando, setTotalRodando] = useState(0);
  const [empresaAtual, setEmpresaAtual] = useState<string | null>(null);
  const [resumo, setResumo] = useState<{ comParcelamento: number; falhas: Empresa[] } | null>(null);

  async function rodar(alvo: Empresa[]) {
    setRodando(true);
    setResumo(null);
    setTotalRodando(alvo.length);
    let comParcelamento = 0;
    const falhas: Empresa[] = [];

    for (let i = 0; i < alvo.length; i++) {
      const empresa = alvo[i];
      setIndice(i + 1);
      setEmpresaAtual(empresa.nome);

      let sucesso = false;
      let encontrouParcelamento = false;
      for (let tentativa = 1; tentativa <= TENTATIVAS_POR_EMPRESA && !sucesso; tentativa++) {
        if (tentativa > 1) await esperar(PAUSA_ENTRE_TENTATIVAS_MS);
        try {
          const resposta = await fetch(
            `/admin/empresas/${empresa.id}/integra-contador/parcelamentos/simples-nacional/verificar`,
            { method: "POST" },
          );
          const corpo = await resposta.json();
          sucesso = resposta.ok;
          encontrouParcelamento = sucesso && corpo.encontrados > 0;
        } catch {
          sucesso = false;
        }
      }
      if (sucesso) {
        if (encontrouParcelamento) comParcelamento += 1;
      } else {
        falhas.push(empresa);
      }
      if (i < alvo.length - 1) await esperar(PAUSA_ENTRE_EMPRESAS_MS);
    }

    setResumo({ comParcelamento, falhas });
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
          Verificar parcelamentos de todas ({empresas.length})
        </Button>
      )}

      {confirmando && (
        <Alert tone="warning">
          <div className="flex flex-col gap-3">
            <span>
              Isso vai verificar parcelamentos de <strong>{empresas.length} empresa(s)</strong>.{" "}
              {semCacheHoje > 0
                ? `${semCacheHoje} delas não têm cache das últimas 24h e vão gerar chamada nova (paga) ao Integra Contador.`
                : "Todas já têm cache das últimas 24h — não deve gerar chamada paga agora."}{" "}
              Confirma?
            </span>
            <div className="flex gap-2">
              <Button variant="primary" loading={rodando} onClick={() => rodar(empresas)}>
                Sim, verificar todas
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
          {indice}/{totalRodando} — {empresaAtual}
        </p>
      )}

      {resumo && (
        <Alert tone={resumo.falhas.length === 0 ? "success" : "warning"}>
          {resumo.comParcelamento} empresa(s) com parcelamento encontrado.
          {resumo.falhas.length > 0 && (
            <div className="mt-2 flex flex-col gap-2">
              <span>
                {resumo.falhas.length} com falha mesmo após {TENTATIVAS_POR_EMPRESA} tentativas:{" "}
                {resumo.falhas.map((f) => f.nome).join(", ")}.
              </span>
              <Button
                type="button"
                variant="secondary"
                loading={rodando}
                onClick={() => rodar(resumo.falhas)}
                className="self-start"
              >
                Tentar de novo só as {resumo.falhas.length} com falha
              </Button>
            </div>
          )}
        </Alert>
      )}
    </div>
  );
}
