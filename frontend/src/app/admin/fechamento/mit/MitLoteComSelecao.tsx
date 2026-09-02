"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { EnviarMitLoteButton } from "./EnviarMitLoteButton";
import { BaixarGuiasMitLoteButton } from "./BaixarGuiasMitLoteButton";

export type LinhaMit = {
  id: string;
  nome: string;
  receitaMes: number;
  receitaTrimestre: number;
  retencaoIrrf: number;
  retencaoFederal: number;
  competenciaIrpj: number;
  competenciaCsll: number;
  competenciaPis: number;
  competenciaCofins: number;
  mitIrpj: number;
  mitCsll: number;
  mitPis: number;
  mitCofins: number;
  jaEnviado: boolean;
};

function formatMoney(value: number) {
  return value === 0 ? "-" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Checkbox por linha decide quem entra nos lotes — "Encerrar" sempre
// exclui quem já foi enviado (efeito legal real, nunca reenvia por
// engano mesmo se a linha estiver marcada), "Baixar guias" respeita a
// seleção como está (inclusive já enviadas, útil pra rebaixar uma guia
// específica sem reprocessar todo mundo).
export function MitLoteComSelecao({ linhas, competencia }: { linhas: LinhaMit[]; competencia: string }) {
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set(linhas.map((l) => l.id)));

  const todosMarcados = linhas.length > 0 && linhas.every((l) => selecionados.has(l.id));
  const algumMarcado = linhas.some((l) => selecionados.has(l.id));

  function alternarTodos() {
    setSelecionados(todosMarcados ? new Set() : new Set(linhas.map((l) => l.id)));
  }
  function alternarUm(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  const empresasParaEnviar = useMemo(
    () => linhas.filter((l) => selecionados.has(l.id) && !l.jaEnviado).map((l) => ({ id: l.id, nome: l.nome })),
    [linhas, selecionados],
  );
  const empresasParaBaixar = useMemo(
    () => linhas.filter((l) => selecionados.has(l.id)).map((l) => ({ id: l.id, nome: l.nome })),
    [linhas, selecionados],
  );

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-foreground/50">
            {algumMarcado ? `${selecionados.size} de ${linhas.length} selecionada(s)` : "Nenhuma selecionada"} — use
            os checkboxes da tabela pra escolher quais empresas entram no lote.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <EnviarMitLoteButton competencia={competencia} empresas={empresasParaEnviar} />
            <BaixarGuiasMitLoteButton competencia={competencia} empresas={empresasParaBaixar} />
          </div>
        </div>
        <p className="mt-3 text-xs text-foreground/50">
          A coluna <strong className="text-danger">MIT</strong> é o que de fato é declarado — já líquido
          de retenção e considerando se IRPJ/CSLL estão no mês de fechamento do trimestre.
        </p>
      </Card>

      {linhas.length === 0 ? (
        <Alert tone="warning">Nenhuma empresa Lucro Presumido com CNPJ cadastrada.</Alert>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[1250px] text-sm">
            <thead>
              <tr className="text-xs text-foreground/50">
                <th rowSpan={2} className="border-b border-border px-3 py-2 text-center align-bottom">
                  <input
                    type="checkbox"
                    checked={todosMarcados}
                    onChange={alternarTodos}
                    aria-label="Selecionar todas"
                  />
                </th>
                <th rowSpan={2} className="border-b border-border px-3 py-2 text-left align-bottom">
                  Nome
                </th>
                <th rowSpan={2} className="border-b border-border px-3 py-2 text-right align-bottom">
                  Faturamento Mês
                </th>
                <th rowSpan={2} className="border-b border-border px-3 py-2 text-right align-bottom">
                  Faturamento Trimestre
                </th>
                <th colSpan={2} className="border-b border-border px-3 py-1 text-center">
                  Impostos retidos
                </th>
                <th colSpan={4} className="border-b border-border px-3 py-1 text-center">
                  Referente a Competência
                </th>
                <th colSpan={4} className="border-b border-border px-3 py-1 text-center text-danger">
                  MIT
                </th>
              </tr>
              <tr className="text-xs text-foreground/50">
                <th className="border-b border-border px-3 py-1 text-right">IRRF</th>
                <th className="border-b border-border px-3 py-1 text-right">Trib. federais</th>
                <th className="border-b border-border px-3 py-1 text-right">IRPJ</th>
                <th className="border-b border-border px-3 py-1 text-right">CSLL</th>
                <th className="border-b border-border px-3 py-1 text-right">PIS</th>
                <th className="border-b border-border px-3 py-1 text-right">COFINS</th>
                <th className="border-b border-border px-3 py-1 text-right text-danger">IRPJ</th>
                <th className="border-b border-border px-3 py-1 text-right text-danger">CSLL</th>
                <th className="border-b border-border px-3 py-1 text-right text-danger">PIS</th>
                <th className="border-b border-border px-3 py-1 text-right text-danger">COFINS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {linhas.map((linha) => (
                <tr key={linha.id}>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={selecionados.has(linha.id)}
                      onChange={() => alternarUm(linha.id)}
                      aria-label={`Selecionar ${linha.nome}`}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {linha.nome}
                    {linha.jaEnviado && (
                      <span className="ml-2 rounded bg-success-soft px-1.5 py-0.5 text-[10px] font-medium text-success">
                        enviado
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{formatMoney(linha.receitaMes)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(linha.receitaTrimestre)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(linha.retencaoIrrf)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(linha.retencaoFederal)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(linha.competenciaIrpj)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(linha.competenciaCsll)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(linha.competenciaPis)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(linha.competenciaCofins)}</td>
                  <td className="px-3 py-2 text-right font-medium text-danger">{formatMoney(linha.mitIrpj)}</td>
                  <td className="px-3 py-2 text-right font-medium text-danger">{formatMoney(linha.mitCsll)}</td>
                  <td className="px-3 py-2 text-right font-medium text-danger">{formatMoney(linha.mitPis)}</td>
                  <td className="px-3 py-2 text-right font-medium text-danger">{formatMoney(linha.mitCofins)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
