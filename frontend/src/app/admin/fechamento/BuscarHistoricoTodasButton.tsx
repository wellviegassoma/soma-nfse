"use client";

import { useState } from "react";
import { buscarHistoricoAgora } from "@/lib/actions/fechamento";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

type Empresa = { id: string; nome: string };

export function BuscarHistoricoTodasButton({ empresas }: { empresas: Empresa[] }) {
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

    // Uma empresa por chamada — nunca uma única requisição longa o
    // bastante pra estourar o tempo limite do servidor, diferente da
    // versão antiga (uma Server Action só, escaneando as ~140 empresas
    // em sequência), que passou a falhar assim que o número de empresas
    // com certificado cresceu o suficiente.
    for (let i = 0; i < empresas.length; i++) {
      const empresa = empresas[i];
      setIndice(i + 1);
      setEmpresaAtual(empresa.nome);

      const formData = new FormData();
      formData.set("companyId", empresa.id);
      const resposta = await buscarHistoricoAgora(undefined, formData);

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
    <div className="flex flex-col items-end gap-2">
      <Button type="button" variant="secondary" loading={rodando} onClick={rodar} disabled={empresas.length === 0}>
        Buscar últimos 12 meses (todas)
      </Button>
      <p className="max-w-[240px] text-right text-xs text-foreground/50">
        Escaneia o histórico completo de cada empresa com certificado, uma de cada vez. Pode
        demorar vários minutos — dá pra deixar a aba aberta em segundo plano.
      </p>
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
