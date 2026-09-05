"use client";

import { useState } from "react";
import { buscarAgora } from "@/lib/actions/fechamento";
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

export function BuscarTodasButton({ competencia, empresas }: { competencia: string; empresas: Empresa[] }) {
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
        <div className="flex flex-col gap-3">
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
