"use client";

import { useState } from "react";
import { buscarHistoricoAgora } from "@/lib/actions/fechamento";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { NotasDivergentesAlerta } from "@/components/fechamento/NotasDivergentesAlerta";
import type { NotaDivergente } from "@/lib/sync-notas";

type Empresa = { id: string; nome: string };

type ErroEmpresa = { nome: string; erro: string };

type NotaDivergenteComEmpresa = NotaDivergente & { empresaNome: string };

type Resumo = {
  sucessos: number;
  erros: number;
  totalNotas: number;
  notasNovas: number;
  errosDetalhe: ErroEmpresa[];
  divergencias: NotaDivergenteComEmpresa[];
};

export function BuscarHistoricoTodasButton({ empresas }: { empresas: Empresa[] }) {
  const [rodando, setRodando] = useState(false);
  const [indice, setIndice] = useState(0);
  const [empresaAtual, setEmpresaAtual] = useState<string | null>(null);
  const [resumo, setResumo] = useState<Resumo | null>(null);

  async function rodar() {
    setRodando(true);
    setResumo(null);
    let sucessos = 0;
    let erros = 0;
    let totalNotas = 0;
    let notasNovas = 0;
    const errosDetalhe: ErroEmpresa[] = [];
    const divergencias: NotaDivergenteComEmpresa[] = [];

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
        notasNovas += resposta.resultado.notasNovas ?? 0;
        for (const d of resposta.resultado.notasDivergentes ?? []) {
          divergencias.push({ empresaNome: empresa.nome, ...d });
        }
      } else {
        erros += 1;
        errosDetalhe.push({
          nome: empresa.nome,
          erro: resposta?.resultado?.erro || resposta?.error || "Erro desconhecido.",
        });
      }
    }

    setResumo({ sucessos, erros, totalNotas, notasNovas, errosDetalhe, divergencias });
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
        <div className="flex w-full flex-col gap-3 text-left">
          <Alert tone={resumo.erros === 0 ? "success" : "warning"}>
            {resumo.sucessos} empresa(s) sincronizada(s) ({resumo.totalNotas} nota(s) no total,{" "}
            {resumo.notasNovas} nova(s))
            {resumo.erros > 0 ? `, ${resumo.erros} com erro` : ""}.
          </Alert>

          {resumo.errosDetalhe.length > 0 && (
            <div className="rounded-lg border border-danger/30 bg-danger-soft/40 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-danger">
                Empresas com erro
              </div>
              <ul className="mt-2 flex flex-col gap-2 text-sm">
                {resumo.errosDetalhe.map((e, i) => (
                  <li key={i}>
                    <span className="font-medium text-foreground">{e.nome}</span>
                    <span className="block text-xs text-foreground/60">{e.erro}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <NotasDivergentesAlerta notas={resumo.divergencias} comEmpresa />
        </div>
      )}
    </div>
  );
}
