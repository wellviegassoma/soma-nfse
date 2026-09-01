"use client";

import { useState } from "react";
import { buscarAgora } from "@/lib/actions/fechamento";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

type Empresa = { id: string; nome: string };

export function BuscarTodasButton({ competencia, empresas }: { competencia: string; empresas: Empresa[] }) {
  const [rodando, setRodando] = useState(false);
  const [indice, setIndice] = useState(0);
  const [empresaAtual, setEmpresaAtual] = useState<string | null>(null);
  const [resumo, setResumo] = useState<{ sucessos: number; erros: number; totalNotas: number } | null>(null);

  async function rodar() {
    setRodando(true);
    setResumo(null);
    let sucessos = 0;
    let erros = 0;
    let totalNotas = 0;

    // Mesma lógica do "Buscar últimos 12 meses (todas)" — uma empresa por
    // chamada, nunca uma única requisição escaneando todas em sequência,
    // que era o que estourava o tempo limite do servidor.
    for (let i = 0; i < empresas.length; i++) {
      const empresa = empresas[i];
      setIndice(i + 1);
      setEmpresaAtual(empresa.nome);

      const formData = new FormData();
      formData.set("companyId", empresa.id);
      formData.set("competencia", competencia);
      const resposta = await buscarAgora(undefined, formData);

      if (resposta?.resultado?.status === "sucesso") {
        sucessos += 1;
        totalNotas += resposta.resultado.notas ?? 0;
      } else {
        erros += 1;
      }
    }

    setResumo({ sucessos, erros, totalNotas });
    setEmpresaAtual(null);
    setRodando(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" loading={rodando} onClick={rodar} disabled={empresas.length === 0}>
        Buscar todas agora ({competencia})
      </Button>
      {rodando && (
        <p className="text-xs text-foreground/60">
          {indice}/{empresas.length} — {empresaAtual}
        </p>
      )}
      {resumo && (
        <Alert tone={resumo.erros === 0 ? "success" : "warning"}>
          {resumo.sucessos} empresa(s) sincronizada(s) ({resumo.totalNotas} nota(s) no total)
          {resumo.erros > 0 ? `, ${resumo.erros} com erro` : ""}.
        </Alert>
      )}
    </div>
  );
}
