"use client";

import { useState } from "react";
import JSZip from "jszip";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

type Empresa = { id: string; nome: string };

function nomeArquivo(texto: string): string {
  return (
    texto
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9 _-]/g, "")
      .trim()
      .slice(0, 60) || "empresa"
  );
}

// Usa a rota .../situacao-fiscal/historico (lê direto do
// integra_contador_cache, nunca chama o serviço de verdade) — baixar o
// relatório de todo mundo aqui nunca custa nada, independente de já ter
// rodado "Consultar de todas" antes ou não (só empresa nunca consultada
// vira falha, não custo).
export function BaixarRelatoriosSituacaoFiscalLoteButton({ empresas }: { empresas: Empresa[] }) {
  const [rodando, setRodando] = useState(false);
  const [indice, setIndice] = useState(0);
  const [empresaAtual, setEmpresaAtual] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [falhas, setFalhas] = useState<string[]>([]);
  const [concluido, setConcluido] = useState(false);

  async function rodar() {
    setRodando(true);
    setErro(null);
    setFalhas([]);
    setConcluido(false);

    const zip = new JSZip();
    const falhasLocais: string[] = [];

    for (let i = 0; i < empresas.length; i++) {
      const empresa = empresas[i];
      setIndice(i + 1);
      setEmpresaAtual(empresa.nome);
      try {
        const resposta = await fetch(`/admin/empresas/${empresa.id}/integra-contador/situacao-fiscal/historico`);
        if (!resposta.ok || resposta.headers.get("Content-Type") !== "application/pdf") {
          falhasLocais.push(empresa.nome);
          continue;
        }
        const blob = await resposta.blob();
        zip.file(`${nomeArquivo(empresa.nome)}.pdf`, blob);
      } catch {
        falhasLocais.push(empresa.nome);
      }
    }

    setFalhas(falhasLocais);
    if (falhasLocais.length < empresas.length) {
      const conteudo = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(conteudo);
      const a = document.createElement("a");
      a.href = url;
      a.download = `situacao-fiscal-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setConcluido(true);
    } else if (empresas.length > 0) {
      setErro("Não consegui baixar nenhum relatório — confira se alguma empresa já foi consultada.");
    }

    setEmpresaAtual(null);
    setRodando(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="secondary"
        loading={rodando}
        onClick={rodar}
        disabled={empresas.length === 0}
      >
        Baixar relatórios em lote (ZIP)
      </Button>
      {rodando && (
        <p className="text-xs text-foreground/60">
          {indice}/{empresas.length} — {empresaAtual}
        </p>
      )}
      {erro && <Alert tone="danger">{erro}</Alert>}
      {concluido && (
        <Alert tone={falhas.length === 0 ? "success" : "warning"}>
          ZIP baixado.
          {falhas.length > 0 && (
            <span className="mt-1 block">
              {falhas.length} relatório(s) não encontrados (ainda não consultados):{" "}
              {falhas.join(", ")}.
            </span>
          )}
        </Alert>
      )}
    </div>
  );
}
