"use client";

import { useState } from "react";
import JSZip from "jszip";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { competenciaParaArquivo } from "@/lib/nome-arquivo-empresa";

type Empresa = { id: string; nome: string; prefixoArquivo: string };

// Guias do ISS retido de Petrópolis (débito ISRSN) de várias empresas num
// ZIP — mesmo padrão do lote de guias do DAS. Só emite boleto de débito que
// a Prefeitura já gerou; não declara nada.
export function GuiasIssRetidoLote({ competencia, empresas }: { competencia: string; empresas: Empresa[] }) {
  const [rodando, setRodando] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ ok: number; falhas: string[] } | null>(null);

  async function rodar() {
    setRodando(true);
    setResultado(null);
    const zip = new JSZip();
    const falhas: string[] = [];
    let ok = 0;
    for (let i = 0; i < empresas.length; i++) {
      const e = empresas[i];
      setProgresso(`${i + 1}/${empresas.length} — ${e.nome}`);
      try {
        const r = await fetch(`/admin/empresas/${e.id}/impostos/guia-iss-retido-petropolis?competencia=${competencia}`);
        if (!r.ok || !r.headers.get("Content-Type")?.startsWith("application/pdf")) {
          const corpo = await r.json().catch(() => null);
          falhas.push(`${e.nome} (${corpo?.error ?? `HTTP ${r.status}`})`);
          continue;
        }
        zip.file(`${e.prefixoArquivo} - ISS retido ${competenciaParaArquivo(competencia)}.pdf`, await r.blob());
        ok++;
      } catch {
        falhas.push(`${e.nome} (falha de conexão)`);
      }
    }
    if (ok > 0) {
      const url = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `iss-retido-petropolis-${competencia}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }
    setResultado({ ok, falhas });
    setProgresso(null);
    setRodando(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="secondary" loading={rodando} disabled={!empresas.length} onClick={rodar}>
        Guias de ISS retido Petrópolis em lote ({empresas.length})
      </Button>
      {progresso && <p className="text-xs text-foreground/60">{progresso}</p>}
      {resultado && (
        <Alert tone={resultado.falhas.length ? "warning" : "success"}>
          {resultado.ok ? `${resultado.ok} guia(s) no ZIP.` : "Nenhuma guia gerada."}
          {resultado.falhas.length > 0 && (
            <span className="mt-1 block">Sem guia: {resultado.falhas.join("; ")}.</span>
          )}
        </Alert>
      )}
    </div>
  );
}
