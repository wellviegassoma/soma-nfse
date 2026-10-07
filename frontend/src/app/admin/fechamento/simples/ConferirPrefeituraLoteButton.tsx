"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { conferirPrefeituraPetropolis } from "@/lib/actions/conferencia-prefeitura";

type Empresa = { id: string; nome: string };

// Só leitura: consulta o faturamento do mês no ISS de Petrópolis, uma
// empresa por chamada (try/catch por empresa — uma falha pontual não pode
// travar o lote), e deixa o resultado na coluna "Prefeitura".
export function ConferirPrefeituraLoteButton({
  competencia,
  empresas,
}: {
  competencia: string;
  empresas: Empresa[];
}) {
  const router = useRouter();
  const [rodando, setRodando] = useState(false);
  const [indice, setIndice] = useState(0);
  const [empresaAtual, setEmpresaAtual] = useState<string | null>(null);
  const [resumo, setResumo] = useState<{ consultadas: number; semAcesso: number } | null>(null);

  async function rodar() {
    setRodando(true);
    setResumo(null);
    let consultadas = 0;
    let semAcesso = 0;
    for (let i = 0; i < empresas.length; i++) {
      setIndice(i + 1);
      setEmpresaAtual(empresas[i].nome);
      try {
        const r = await conferirPrefeituraPetropolis(empresas[i].id, competencia);
        if (r.ok) consultadas += 1;
        else semAcesso += 1;
      } catch {
        semAcesso += 1;
      }
    }
    setResumo({ consultadas, semAcesso });
    setEmpresaAtual(null);
    setRodando(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="secondary" loading={rodando} onClick={rodar} disabled={empresas.length === 0}>
        Conferir com a prefeitura (Petrópolis)
      </Button>
      {rodando && (
        <p className="text-xs text-foreground/60">
          {indice}/{empresas.length} — {empresaAtual}
        </p>
      )}
      {resumo && (
        <Alert tone={resumo.semAcesso === 0 ? "success" : "warning"}>
          {resumo.consultadas} consultada(s)
          {resumo.semAcesso > 0 && ` — ${resumo.semAcesso} sem acesso (ver o motivo na coluna Prefeitura).`}
        </Alert>
      )}
    </div>
  );
}
