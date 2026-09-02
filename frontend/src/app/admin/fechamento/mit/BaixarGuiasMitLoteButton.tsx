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

// Monta o ZIP inteiro no navegador (não em background/Blob como o
// fechamento) — poucas dezenas de empresas Lucro Presumido hoje, cada
// PDF é pequeno (é só a guia, não XML+PDF de cada nota). Se o número de
// clientes Lucro Presumido crescer muito, migrar pro mesmo padrão de job
// em segundo plano do "Baixar tudo (ZIP)" do fechamento.
export function BaixarGuiasMitLoteButton({ competencia, empresas }: { competencia: string; empresas: Empresa[] }) {
  const [rodando, setRodando] = useState(false);
  const [indice, setIndice] = useState(0);
  const [empresaAtual, setEmpresaAtual] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [falhas, setFalhas] = useState<string[]>([]);
  const [concluido, setConcluido] = useState(false);
  const [ano, mes] = competencia.split("-");

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
        const resposta = await fetch(`/admin/empresas/${empresa.id}/integra-contador/mit/guia/${ano}/${mes}`);
        const corpo = await resposta.json();
        if (!resposta.ok || !corpo.pdf) {
          falhasLocais.push(empresa.nome);
          continue;
        }
        const bin = atob(corpo.pdf as string);
        const bytes = new Uint8Array(bin.length);
        for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
        zip.file(`${nomeArquivo(empresa.nome)}.pdf`, bytes);
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
      a.download = `guias-mit-${competencia}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setConcluido(true);
    } else if (empresas.length > 0) {
      setErro("Não consegui gerar nenhuma guia — confira se as apurações já estão encerradas.");
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
        Baixar guias em lote (ZIP)
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
              {falhas.length} guia(s) não geraram (provavelmente ainda não encerradas na DCTFWeb):{" "}
              {falhas.join(", ")}.
            </span>
          )}
        </Alert>
      )}
    </div>
  );
}
