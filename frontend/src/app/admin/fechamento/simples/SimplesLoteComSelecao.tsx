"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { EnviarSimplesLoteButton } from "./EnviarSimplesLoteButton";
import { BaixarGuiasSimplesLoteButton } from "./BaixarGuiasSimplesLoteButton";

export type LinhaSimples = {
  id: string;
  nome: string;
  receitaMes: number;
  rbt12: number;
  rbt12Estimado: boolean;
  anexo: string;
  aliquotaEfetiva: number;
  retencaoIrrf: number;
  retencaoFederal: number;
  dasBruto: number;
  dasLiquido: number;
  bloqueios: string[];
  jaEnviado: boolean;
};

function formatMoney(value: number) {
  return value === 0 ? "-" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPercent(value: number) {
  return `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

// Mesmo espírito de MitLoteComSelecao.tsx — checkbox por linha decide
// quem entra nos lotes. "Declarar e transmitir" sempre exclui quem já
// foi enviado ou tem pendência de classificação (efeito legal real,
// nunca ignora essas travas mesmo se a linha estiver marcada);
// "Baixar guias" respeita a seleção como está.
export function SimplesLoteComSelecao({
  linhas,
  competencia,
  periodoApuracao,
}: {
  linhas: LinhaSimples[];
  competencia: string;
  periodoApuracao: string;
}) {
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
    () =>
      linhas
        .filter((l) => selecionados.has(l.id) && !l.jaEnviado && l.bloqueios.length === 0)
        .map((l) => ({ id: l.id, nome: l.nome })),
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
            <EnviarSimplesLoteButton competencia={competencia} empresas={empresasParaEnviar} />
            <BaixarGuiasSimplesLoteButton
              competencia={competencia}
              periodoApuracao={periodoApuracao}
              empresas={empresasParaBaixar}
            />
          </div>
        </div>
        <p className="mt-3 text-xs text-foreground/50">
          A coluna <strong className="text-danger">DAS líquido</strong> é o valor que de fato seria
          transmitido no PGDAS-D — já líquido de retenção sofrida. Empresas com pendência de
          classificação de atividade ficam de fora do envio em lote até serem corrigidas.
        </p>
      </Card>

      {linhas.length === 0 ? (
        <Alert tone="warning">Nenhuma empresa Simples Nacional com CNPJ cadastrada.</Alert>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[1150px] text-sm">
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
                  RBT12
                </th>
                <th rowSpan={2} className="border-b border-border px-3 py-2 text-center align-bottom">
                  Anexo
                </th>
                <th rowSpan={2} className="border-b border-border px-3 py-2 text-right align-bottom">
                  Alíquota
                </th>
                <th colSpan={2} className="border-b border-border px-3 py-1 text-center">
                  Impostos retidos
                </th>
                <th rowSpan={2} className="border-b border-border px-3 py-2 text-right align-bottom">
                  DAS bruto
                </th>
                <th rowSpan={2} className="border-b border-border px-3 py-2 text-right align-bottom text-danger">
                  DAS líquido
                </th>
              </tr>
              <tr className="text-xs text-foreground/50">
                <th className="border-b border-border px-3 py-1 text-right">IRRF</th>
                <th className="border-b border-border px-3 py-1 text-right">Trib. federais</th>
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
                    {linha.bloqueios.length > 0 && (
                      <span
                        className="ml-2 rounded bg-danger-soft px-1.5 py-0.5 text-[10px] font-medium text-danger"
                        title={linha.bloqueios.join(" ")}
                      >
                        {linha.bloqueios.length === 1 ? "1 pendência" : `${linha.bloqueios.length} pendências`}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{formatMoney(linha.receitaMes)}</td>
                  <td className="px-3 py-2 text-right">
                    {formatMoney(linha.rbt12)}
                    {linha.rbt12Estimado && <span className="ml-1 text-[10px] text-foreground/40">(est.)</span>}
                  </td>
                  <td className="px-3 py-2 text-center">{linha.anexo}</td>
                  <td className="px-3 py-2 text-right">{formatPercent(linha.aliquotaEfetiva)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(linha.retencaoIrrf)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(linha.retencaoFederal)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(linha.dasBruto)}</td>
                  <td className="px-3 py-2 text-right font-medium text-danger">{formatMoney(linha.dasLiquido)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
