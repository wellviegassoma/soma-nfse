"use client";

import { useState } from "react";
import {
  iniciarExportacaoFechamento,
  processarEmpresaExportacao,
  finalizarExportacaoFechamento,
} from "@/lib/actions/fechamento";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

const TENTATIVAS_POR_EMPRESA = 3;

export function ExportarZipButton({ competencia }: { competencia: string }) {
  const [rodando, setRodando] = useState(false);
  const [indice, setIndice] = useState(0);
  const [total, setTotal] = useState(0);
  const [empresaAtual, setEmpresaAtual] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [empresasComFalha, setEmpresasComFalha] = useState<string[]>([]);

  async function rodar() {
    setRodando(true);
    setErro(null);
    setDownloadUrl(null);
    setEmpresasComFalha([]);

    const inicio = await iniciarExportacaoFechamento(competencia);
    if ("error" in inicio) {
      setErro(inicio.error);
      setRodando(false);
      return;
    }

    const { exportacaoId, empresas } = inicio;
    setTotal(empresas.length);
    const nomePorId = new Map(empresas.map((e) => [e.id, e.nome]));
    const falhasNaGeracao: string[] = [];

    // Uma empresa por chamada — gera XML/PDF/relatório dela e guarda no
    // Blob, sem nenhuma requisição chegar perto do tempo limite do
    // servidor mesmo com milhares de notas no total. Retry aqui é
    // redundante com o retry já feito dentro da Server Action, mas cobre
    // o caso da própria chamada de rede falhar antes de chegar lá.
    for (let i = 0; i < empresas.length; i++) {
      setIndice(i + 1);
      setEmpresaAtual(empresas[i].nome);

      let sucesso = false;
      for (let tentativa = 1; tentativa <= TENTATIVAS_POR_EMPRESA && !sucesso; tentativa++) {
        const resposta = await processarEmpresaExportacao(exportacaoId, empresas[i].id, competencia);
        sucesso = !("error" in resposta);
      }
      if (!sucesso) falhasNaGeracao.push(empresas[i].id);
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
      const todasFaltando = [...new Set([...falhasNaGeracao, ...resultado.empresasFaltando])];
      setEmpresasComFalha(todasFaltando.map((id) => nomePorId.get(id) ?? id));
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
        <Alert tone={empresasComFalha.length === 0 ? "success" : "warning"}>
          ZIP pronto —{" "}
          <a href={downloadUrl} className="underline">
            clique aqui pra baixar
          </a>
          .
          {empresasComFalha.length > 0 && (
            <span className="mt-1 block">
              {empresasComFalha.length} empresa(s) não entraram, mesmo após{" "}
              {TENTATIVAS_POR_EMPRESA} tentativas: {empresasComFalha.join(", ")}. Clique em
              &quot;Baixar tudo (ZIP)&quot; de novo pra tentar incluí-las.
            </span>
          )}
        </Alert>
      )}
    </div>
  );
}
