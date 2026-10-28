"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { formatarDataHora, formatarMoeda } from "@/lib/formatters";
import type { GuiaFgts } from "@/lib/fgts-infosimples";
import { ConsultarFgtsLoteButton } from "./ConsultarFgtsLoteButton";

export type LinhaFgts = {
  id: string;
  nome: string;
  cnpj: string;
  certificado: "VALIDO" | "VENCIDO" | "SEM";
  certificadoValidade: string | null;
  consulta: {
    consultadoEm: string;
    status: "sucesso" | "erro";
    erro: string | null;
    qtdEmAberto: number;
    valorEmAberto: number;
    guiasEmAberto: GuiaFgts[];
    guiasQuitadas: GuiaFgts[];
  } | null;
};

type Filtro = "TODAS" | "CERT_VALIDO" | "CERT_INVALIDO" | "EM_ABERTO" | "ERRO";

function dataCurta(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function CelulaCertificado({ linha }: { linha: LinhaFgts }) {
  if (linha.certificado === "SEM") return <span className="text-xs text-foreground/40">sem certificado</span>;
  if (linha.certificado === "VENCIDO") {
    return (
      <span className="rounded bg-danger-soft px-1.5 py-0.5 text-[10px] font-medium text-danger">
        vencido em {dataCurta(linha.certificadoValidade!)}
      </span>
    );
  }
  return (
    <span className="rounded bg-success-soft px-1.5 py-0.5 text-[10px] font-medium text-success">
      válido até {dataCurta(linha.certificadoValidade!)}
    </span>
  );
}

function CelulaGuias({ linha }: { linha: LinhaFgts }) {
  const c = linha.consulta;
  if (!c) return null;
  if (c.status === "erro") return <span className="text-danger">{c.erro}</span>;
  if (c.qtdEmAberto === 0) {
    return (
      <span className="text-foreground/40">
        nenhuma
        {c.guiasQuitadas.length > 0 &&
          ` — ${c.guiasQuitadas
            .map(
              (g) =>
                `${g.situacao ?? "sem situação"}${g.data_arrecadacao ? ` em ${g.data_arrecadacao}` : ""}${
                  g.valor_total !== null ? ` (${formatarMoeda(g.valor_total)})` : ""
                }`,
            )
            .join("; ")}`}
      </span>
    );
  }
  return (
    <ul className="flex flex-col gap-1">
      {c.guiasEmAberto.map((g, i) => (
        <li key={g.numero ?? i}>
          <strong>{g.valor_total !== null ? formatarMoeda(g.valor_total) : "valor ?"}</strong>
          {g.data_limite_pagamento && <> · vence {g.data_limite_pagamento}</>}
          {g.tipo && <> · {g.tipo}</>}
          {g.situacao && <span className="text-foreground/50"> ({g.situacao})</span>}
          {g.guia_pdf_url && (
            <>
              {" "}
              <a href={g.guia_pdf_url} target="_blank" className="font-medium text-brand hover:underline">
                PDF
              </a>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

// Mesmo padrão de SimplesLoteComSelecao.tsx — checkbox por linha decide
// quem entra no lote. Começa marcando só quem tem certificado digital
// válido cadastrado: a consulta usa o certificado da SOMA como
// procuradora, mas cliente sem certificado próprio válido é quase sempre
// cliente sem procuração ativa no FGTS Digital — e consultar esses só
// gasta tempo (até ~4,5 min de timeout cada) sem trazer guia.
export function FgtsLoteComSelecao({ linhas }: { linhas: LinhaFgts[] }) {
  const [selecionados, setSelecionados] = useState<Set<string>>(
    () => new Set(linhas.filter((l) => l.certificado === "VALIDO").map((l) => l.id)),
  );
  const [filtro, setFiltro] = useState<Filtro>("TODAS");

  const contagem = useMemo(
    () => ({
      certValido: linhas.filter((l) => l.certificado === "VALIDO").length,
      certInvalido: linhas.filter((l) => l.certificado !== "VALIDO").length,
      emAberto: linhas.filter((l) => l.consulta?.status === "sucesso" && l.consulta.qtdEmAberto > 0).length,
      erro: linhas.filter((l) => l.consulta?.status === "erro").length,
    }),
    [linhas],
  );
  const totalEmAberto = useMemo(
    () => linhas.reduce((s, l) => s + (l.consulta?.status === "sucesso" ? l.consulta.valorEmAberto : 0), 0),
    [linhas],
  );

  const linhasVisiveis = useMemo(
    () =>
      linhas.filter((l) => {
        switch (filtro) {
          case "CERT_VALIDO":
            return l.certificado === "VALIDO";
          case "CERT_INVALIDO":
            return l.certificado !== "VALIDO";
          case "EM_ABERTO":
            return l.consulta?.status === "sucesso" && l.consulta.qtdEmAberto > 0;
          case "ERRO":
            return l.consulta?.status === "erro";
          default:
            return true;
        }
      }),
    [linhas, filtro],
  );

  // O checkbox do cabeçalho age só sobre as linhas visíveis no filtro.
  const todosMarcados = linhasVisiveis.length > 0 && linhasVisiveis.every((l) => selecionados.has(l.id));

  function alternarTodos() {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      for (const l of linhasVisiveis) {
        if (todosMarcados) novo.delete(l.id);
        else novo.add(l.id);
      }
      return novo;
    });
  }
  function alternarUm(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  // Pra refazer só quem falhou na última consulta (instabilidade da
  // Infosimples, saldo que acabou no meio do lote) — troca a seleção
  // inteira, não soma à atual.
  function selecionarSoComErro() {
    setSelecionados(new Set(linhas.filter((l) => l.consulta?.status === "erro").map((l) => l.id)));
    setFiltro("ERRO");
  }

  const empresasParaConsultar = useMemo(
    () => linhas.filter((l) => selecionados.has(l.id)).map((l) => ({ id: l.id, nome: l.nome })),
    [linhas, selecionados],
  );

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-foreground/50">
            {empresasParaConsultar.length} de {linhas.length} selecionada(s) — use os checkboxes pra escolher
            quem entra na consulta. Começa marcado só quem tem certificado digital válido. Cada consulta é paga
            (cerca de R$ 0,28) e só traz guia de cliente com procuração pra SOMA no FGTS Digital.
          </p>
          <ConsultarFgtsLoteButton empresas={empresasParaConsultar} />
        </div>
        {(contagem.emAberto > 0 || contagem.erro > 0) && (
          <p className="mt-3 text-sm">
            <strong>{contagem.emAberto}</strong> empresa(s) com guia em aberto, total{" "}
            <strong>{formatarMoeda(totalEmAberto)}</strong>
            {contagem.erro > 0 && <> · {contagem.erro} com erro na última consulta</>}.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {(
            [
              ["TODAS", `Todas (${linhas.length})`],
              ["CERT_VALIDO", `Certificado válido (${contagem.certValido})`],
              ["CERT_INVALIDO", `Sem certificado ou vencido (${contagem.certInvalido})`],
              ["EM_ABERTO", `Com guia em aberto (${contagem.emAberto})`],
              ["ERRO", `Com erro (${contagem.erro})`],
            ] as [Filtro, string][]
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setFiltro(valor)}
              className={`rounded-full border px-3 py-1 ${
                filtro === valor ? "border-foreground bg-foreground text-background" : "border-border text-foreground/70"
              }`}
            >
              {rotulo}
            </button>
          ))}
          {contagem.erro > 0 && (
            <button
              type="button"
              onClick={selecionarSoComErro}
              className="rounded-full border border-danger px-3 py-1 text-danger"
            >
              Selecionar só as com erro ({contagem.erro})
            </button>
          )}
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-foreground/50">
              <th className="border-b border-border px-3 py-2 text-center">
                <input type="checkbox" checked={todosMarcados} onChange={alternarTodos} aria-label="Selecionar todas" />
              </th>
              <th className="border-b border-border px-3 py-2 text-left">Nome</th>
              <th className="border-b border-border px-3 py-2 text-left">CNPJ</th>
              <th className="border-b border-border px-3 py-2 text-left">Certificado</th>
              <th className="border-b border-border px-3 py-2 text-left">Última consulta</th>
              <th className="border-b border-border px-3 py-2 text-left">Guias em aberto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {linhasVisiveis.map((linha) => (
              <tr key={linha.id} className="align-top">
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={selecionados.has(linha.id)}
                    onChange={() => alternarUm(linha.id)}
                    aria-label={`Selecionar ${linha.nome}`}
                  />
                </td>
                <td className="whitespace-nowrap px-3 py-2">{linha.nome}</td>
                <td className="whitespace-nowrap px-3 py-2 text-foreground/60">{linha.cnpj}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <CelulaCertificado linha={linha} />
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {linha.consulta ? (
                    formatarDataHora(linha.consulta.consultadoEm)
                  ) : (
                    <span className="text-foreground/40">nunca consultada</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <CelulaGuias linha={linha} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
