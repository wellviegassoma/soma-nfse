"use client";

import { useState } from "react";
import {
  iniciarExportacaoFechamento,
  processarEmpresaExportacao,
  finalizarExportacaoFechamento,
} from "@/lib/actions/fechamento";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export function ExportarZipButton({ competencia }: { competencia: string }) {
  const [rodando, setRodando] = useState(false);
  const [indice, setIndice] = useState(0);
  const [total, setTotal] = useState(0);
  const [empresaAtual, setEmpresaAtual] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  async function rodar() {
    setRodando(true);
    setErro(null);
    setDownloadUrl(null);

    const inicio = await iniciarExportacaoFechamento(competencia);
    if ("error" in inicio) {
      setErro(inicio.error);
      setRodando(false);
      return;
    }

    const { exportacaoId, empresas } = inicio;
    setTotal(empresas.length);

    // Uma empresa por chamada — gera XML/PDF/relatório dela e guarda no
    // Blob, sem nenhuma requisição chegar perto do tempo limite do
    // servidor mesmo com milhares de notas no total.
    for (let i = 0; i < empresas.length; i++) {
      setIndice(i + 1);
      setEmpresaAtual(empresas[i].nome);
      await processarEmpresaExportacao(exportacaoId, empresas[i].id, competencia);
    }

    setEmpresaAtual("Montando o ZIP final...");
    const resultado = await finalizarExportacaoFechamento(
      exportacaoId,
      competencia,
      empresas.map((e) => e.id),
    );

    if ("error" in resultado) {
      setErro(resultado.error);
    } else {
      setDownloadUrl(`/api/fechamento/exportacoes/${exportacaoId}`);
    }
    setEmpresaAtual(null);
    setRodando(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="secondary" loading={rodando} onClick={rodar}>
        Baixar tudo (ZIP)
      </Button>
      {rodando && (
        <p className="text-xs text-foreground/60">
          {indice}/{total} — {empresaAtual}
        </p>
      )}
      {erro && <Alert tone="danger">{erro}</Alert>}
      {downloadUrl && (
        <Alert tone="success">
          ZIP pronto —{" "}
          <a href={downloadUrl} className="underline">
            clique aqui pra baixar
          </a>
          .
        </Alert>
      )}
    </div>
  );
}
