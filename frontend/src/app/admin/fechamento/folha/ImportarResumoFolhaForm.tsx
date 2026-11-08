"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import {
  lerResumoFolhaLote,
  salvarResumoFolhaLote,
  type PreviaFolhaLinha,
} from "@/lib/actions/folha-lote";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { formatarMoeda } from "@/lib/formatters";

type Filtro = "TODAS" | "SOBRESCREVE" | "NOVO" | "SEM_MUDANCA" | "SEM_FATOR_R";

function mmaaaa(competencia: string) {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

function brl(v: number) {
  return v.toFixed(2).replace(".", ",");
}

// Valor novo com o atual riscado ao lado quando muda algo já gravado.
function Valor({ novo, atual }: { novo: number; atual: number | null }) {
  const muda = atual != null && atual !== 0 && Math.abs(atual - novo) >= 0.005;
  return (
    <div className="text-right tabular-nums">
      <div>{formatarMoeda(novo)}</div>
      {muda && <div className="text-[11px] text-warning line-through">{formatarMoeda(atual)}</div>}
    </div>
  );
}

const ROTULO_SITUACAO: Record<PreviaFolhaLinha["situacao"], { texto: string; classe: string }> = {
  NOVO: { texto: "novo", classe: "bg-success-soft text-success" },
  SOBRESCREVE: { texto: "sobrescreve", classe: "bg-warning-soft text-warning" },
  SEM_MUDANCA: { texto: "sem mudança", classe: "bg-foreground/5 text-foreground/50" },
};

export function ImportarResumoFolhaForm() {
  const [lerState, lerAction, lerPending] = useActionState(lerResumoFolhaLote, undefined);
  const [salvarState, salvarAction, salvarPending] = useActionState(salvarResumoFolhaLote, undefined);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState<Filtro>("TODAS");
  const [descartada, setDescartada] = useState(false);

  // Nova prévia → marca por padrão quem usa Fator R e tem algo a mudar
  // (ajuste de estado durante o render, sem useEffect — mesmo padrão de
  // ImportarFolhaAnaliticaForm).
  const [lerVisto, setLerVisto] = useState(lerState);
  if (lerState !== lerVisto) {
    setLerVisto(lerState);
    setDescartada(false);
    setFiltro("TODAS");
    setSelecionados(
      new Set(
        (lerState?.previa?.linhas ?? [])
          .filter((l) => l.usaFatorR && l.ativa && l.situacao !== "SEM_MUDANCA")
          .map((l) => l.chave),
      ),
    );
  }
  const [salvarVisto, setSalvarVisto] = useState(salvarState);
  if (salvarState !== salvarVisto) {
    setSalvarVisto(salvarState);
    if (salvarState?.success) setDescartada(true);
  }

  const previa = !descartada ? lerState?.previa : undefined;
  const linhas = useMemo(() => previa?.linhas ?? [], [previa]);

  const contagem = useMemo(
    () => ({
      sobrescreve: linhas.filter((l) => l.situacao === "SOBRESCREVE").length,
      novo: linhas.filter((l) => l.situacao === "NOVO").length,
      semMudanca: linhas.filter((l) => l.situacao === "SEM_MUDANCA").length,
      semFatorR: linhas.filter((l) => !l.usaFatorR).length,
    }),
    [linhas],
  );

  const visiveis = useMemo(
    () =>
      linhas.filter((l) => {
        if (filtro === "TODAS") return true;
        if (filtro === "SEM_FATOR_R") return !l.usaFatorR;
        return l.situacao === filtro;
      }),
    [linhas, filtro],
  );

  const itens = useMemo(
    () =>
      JSON.stringify(
        linhas
          .filter((l) => selecionados.has(l.chave))
          .map((l) => ({
            companyId: l.companyId,
            competencia: l.competencia,
            proLabore: l.proLabore,
            salarios: l.salarios,
            fgts: l.fgts,
          })),
      ),
    [linhas, selecionados],
  );
  const qtdSelecionados = linhas.filter((l) => selecionados.has(l.chave)).length;
  const sobrescritasSelecionadas = linhas.filter(
    (l) => selecionados.has(l.chave) && l.situacao === "SOBRESCREVE",
  ).length;

  const todosVisiveisMarcados = visiveis.length > 0 && visiveis.every((l) => selecionados.has(l.chave));
  function alternarTodosVisiveis() {
    setSelecionados((s) => {
      const n = new Set(s);
      for (const l of visiveis) {
        if (todosVisiveisMarcados) n.delete(l.chave);
        else n.add(l.chave);
      }
      return n;
    });
  }
  function alternar(chave: string) {
    setSelecionados((s) => {
      const n = new Set(s);
      if (n.has(chave)) n.delete(chave);
      else n.add(chave);
      return n;
    });
  }

  function baixarCsv() {
    if (!previa) return;
    const cab = "cnpj;empresa;competencia;pro_labore_autonomos;salarios;fgts";
    const limpar = (s: string) => s.replace(/[;\r\n"]/g, " ");
    const corpo = [
      ...previa.linhas.map(
        (l) =>
          `${l.cnpj};${limpar(l.empresa)};${mmaaaa(l.competencia)};${brl(l.proLabore)};${brl(l.salarios)};${brl(l.fgts)}`,
      ),
      // CPF/CEI vêm mascarados (dado pessoal) e nunca casariam com um CNPJ — ficam fora.
      ...previa.naoEncontradas.filter((n) => n.documento.includes("/")).map(
        (n) =>
          `${n.documento};${limpar(n.nome)};${mmaaaa(n.competencia)};${brl(n.proLabore)};${brl(n.salarios)};${brl(n.fgts)}`,
      ),
    ];
    const blob = new Blob(["﻿" + [cab, ...corpo].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const comp = previa.linhas[0]?.competencia ?? previa.naoEncontradas[0]?.competencia ?? "";
    a.download = `folha-lote-${comp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-5">
      {!previa && (
        <form action={lerAction} className="flex flex-wrap items-end gap-3">
          <input type="file" name="arquivo" accept="application/pdf,.pdf,.csv,text/csv" required className="text-sm" />
          <Button type="submit" loading={lerPending}>
            Ler arquivo
          </Button>
          <Link href="/admin/fechamento" className="text-sm font-medium text-foreground/60 hover:underline">
            Voltar
          </Link>
        </form>
      )}
      {lerState?.error && !previa && <Alert tone="danger">{lerState.error}</Alert>}
      {salvarState?.success && descartada && (
        <Alert tone="success">
          Folha gravada para {salvarState.empresas} empresa(s) ({salvarState.linhasGravadas} competência(s) em
          folha_mensal). O Fator R de cada uma já considera os novos valores.
        </Alert>
      )}

      {previa && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-foreground">{previa.arquivo}</span>
            <span className="text-foreground/50">
              · {linhas.length} empresa(s) encontrada(s) · {previa.naoEncontradas.length} não encontrada(s)
            </span>
          </div>

          {previa.errosCsv.length > 0 && (
            <Alert tone="warning">
              {previa.errosCsv.length} linha(s) do CSV ignorada(s): {previa.errosCsv.slice(0, 5).join(" · ")}
              {previa.errosCsv.length > 5 && " …"}
            </Alert>
          )}

          <p className="text-xs text-foreground/50">
            Pró-labore + autônomos vão para o mês da folha; salários e FGTS (mensal + 13º + rescisório) vão
            para o mês seguinte, quando são pagos. Valor riscado = o que está gravado hoje e vai ser
            substituído. Já vêm marcadas as empresas do Simples sujeitas ao Fator R que têm algo a mudar.
          </p>

          <div className="flex flex-wrap gap-2 text-xs">
            {(
              [
                ["TODAS", `Todas (${linhas.length})`],
                ["SOBRESCREVE", `Sobrescrevem (${contagem.sobrescreve})`],
                ["NOVO", `Novas (${contagem.novo})`],
                ["SEM_MUDANCA", `Sem mudança (${contagem.semMudanca})`],
                ["SEM_FATOR_R", `Não usam Fator R (${contagem.semFatorR})`],
              ] as [Filtro, string][]
            ).map(([f, rotulo]) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                className={`rounded-full border px-3 py-1 ${
                  filtro === f ? "border-brand bg-brand/10 text-brand" : "border-border text-foreground/60"
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-foreground/5 text-xs text-foreground/60">
                <tr>
                  <th className="px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={todosVisiveisMarcados}
                      onChange={alternarTodosVisiveis}
                      aria-label="Marcar todas as visíveis"
                    />
                  </th>
                  <th className="px-3 py-2 text-left">Empresa</th>
                  <th className="px-3 py-2 text-right">Pró-labore + aut.</th>
                  <th className="px-3 py-2 text-right">Salários</th>
                  <th className="px-3 py-2 text-right">FGTS</th>
                  <th className="px-3 py-2 text-left">Situação</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => (
                  <tr key={l.chave} className="border-t border-border align-top">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selecionados.has(l.chave)}
                        onChange={() => alternar(l.chave)}
                        aria-label={`Gravar ${l.empresa}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/empresas/${l.companyId}/fator-r`}
                        target="_blank"
                        className="font-medium text-foreground hover:underline"
                      >
                        {l.codigoCliente ? `${l.codigoCliente} · ` : ""}
                        {l.empresa}
                      </Link>
                      <div className="text-[11px] text-foreground/50">
                        {l.cnpj} · folha {mmaaaa(l.competencia)}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Valor novo={l.proLabore} atual={l.atual.proLabore} />
                      <div className="text-right text-[11px] text-foreground/40">→ {mmaaaa(l.competencia)}</div>
                    </td>
                    <td className="px-3 py-2">
                      <Valor novo={l.salarios} atual={l.atual.salarios} />
                      <div className="text-right text-[11px] text-foreground/40">
                        → {mmaaaa(l.competenciaSalariosFgts)}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Valor novo={l.fgts} atual={l.atual.fgts} />
                      <div className="text-right text-[11px] text-foreground/40">
                        → {mmaaaa(l.competenciaSalariosFgts)}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${ROTULO_SITUACAO[l.situacao].classe}`}
                        >
                          {ROTULO_SITUACAO[l.situacao].texto}
                        </span>
                        {!l.usaFatorR && (
                          <span className="rounded bg-foreground/5 px-1.5 py-0.5 text-[10px] font-medium text-foreground/50">
                            não usa Fator R
                          </span>
                        )}
                      </div>
                      {l.avisos.map((a) => (
                        <div key={a} className="mt-1 text-[11px] text-warning">
                          {a}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
                {visiveis.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-xs text-foreground/40">
                      Nenhuma empresa nesse filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {previa.naoEncontradas.length > 0 && (
            <details className="rounded-lg border border-border p-4">
              <summary className="cursor-pointer text-sm font-medium text-foreground">
                {previa.naoEncontradas.length} empresa(s) do arquivo sem cadastro com esse CNPJ (não serão
                gravadas)
              </summary>
              <ul className="mt-3 flex flex-col gap-1 text-xs text-foreground/60">
                {previa.naoEncontradas.map((n, i) => (
                  <li key={`${n.documento}-${n.competencia}-${i}`}>
                    <span className="font-mono">{n.documento}</span> — {n.nome} ({mmaaaa(n.competencia)}):
                    pró-labore {formatarMoeda(n.proLabore)}, salários {formatarMoeda(n.salarios)}, FGTS{" "}
                    {formatarMoeda(n.fgts)}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <form action={salvarAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="itens" value={itens} />
            <Button type="submit" loading={salvarPending} disabled={qtdSelecionados === 0}>
              Gravar {qtdSelecionados} empresa(s)
            </Button>
            <Button type="button" variant="secondary" onClick={baixarCsv}>
              Baixar CSV
            </Button>
            <Button type="button" variant="secondary" onClick={() => setDescartada(true)}>
              Cancelar
            </Button>
            {sobrescritasSelecionadas > 0 && (
              <span className="text-xs text-warning">
                {sobrescritasSelecionadas} delas vão substituir valores já gravados.
              </span>
            )}
          </form>
          {salvarState?.error && <Alert tone="danger">{salvarState.error}</Alert>}
        </div>
      )}
    </div>
  );
}
