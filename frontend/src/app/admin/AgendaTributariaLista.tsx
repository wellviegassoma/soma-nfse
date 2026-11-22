"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { cn } from "@/lib/cn";
import {
  enviarPlanilhaAgendaAction,
  reimportarAgendaAction,
  type AgendaActionState,
} from "@/lib/actions/agenda-tributaria";

export type AgendaLinha = {
  id: number;
  tipo: "TRIBUTO" | "DECLARACAO";
  dia: number | null;
  dia_texto: string | null;
  vencimento: string | null;
  codigo: string | null;
  grupo: string | null;
  descricao: string;
  periodo: string | null;
  documento: string | null;
  relevante: boolean;
};

const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function nomeMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return `${NOMES_MES[m - 1]}/${a}`;
}

function dataUtc(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function somarDias(iso: string, n: number) {
  const d = dataUtc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function rotuloData(iso: string) {
  const d = dataUtc(iso);
  return `${DIAS_SEMANA[d.getUTCDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

type Grupo = { chave: string; titulo: string; data: string | null; itens: AgendaLinha[] };

export function AgendaTributariaLista({
  mes,
  hoje,
  info,
  linhas,
  erro,
  hrefAnterior,
  hrefProximo,
  hrefAtual,
}: {
  mes: string;
  hoje: string;
  info: { ade: string | null; fonte_url: string | null; origem: string; importado_em: string } | null;
  linhas: AgendaLinha[];
  erro: string | null;
  hrefAnterior: string;
  hrefProximo: string;
  hrefAtual: string;
}) {
  const [todas, setTodas] = useState(false);
  const [busca, setBusca] = useState("");

  // "Próximos 7 dias" (hoje + 6): no fim de semana já mostra a semana que
  // vem, em vez de uma semana que acabou.
  const fimSemana = somarDias(hoje, 6);

  const filtradas = useMemo(() => {
    const q = semAcento(busca.trim());
    return linhas.filter((l) => {
      if (!todas && !l.relevante) return false;
      if (!q) return true;
      return semAcento(
        [l.codigo, l.grupo, l.descricao, l.periodo, l.documento].filter(Boolean).join(" "),
      ).includes(q);
    });
  }, [linhas, todas, busca]);

  const grupos = useMemo(() => {
    const porData = new Map<string, Grupo>();
    const diario: AgendaLinha[] = [];
    const outros: AgendaLinha[] = [];
    for (const l of filtradas) {
      if (l.vencimento) {
        const g = porData.get(l.vencimento) ?? {
          chave: l.vencimento, titulo: rotuloData(l.vencimento), data: l.vencimento, itens: [],
        };
        g.itens.push(l);
        porData.set(l.vencimento, g);
      } else if (l.dia === 0) diario.push(l);
      else outros.push(l);
    }
    const lista = [...porData.values()].sort((a, b) => a.chave.localeCompare(b.chave));
    if (diario.length) lista.push({ chave: "diario", titulo: "Diário (fato gerador no dia)", data: null, itens: diario });
    if (outros.length) lista.push({ chave: "outros", titulo: "Outros prazos", data: null, itens: outros });
    return lista;
  }, [filtradas]);

  const venceHoje = filtradas.filter((l) => l.vencimento === hoje).length;
  const venceSemana = filtradas.filter(
    (l) => l.vencimento && l.vencimento >= hoje && l.vencimento <= fimSemana,
  ).length;
  const totalRelevantes = linhas.filter((l) => l.relevante).length;

  return (
    <Card id="agenda-tributaria" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <div className="text-sm font-semibold text-foreground/70">Agenda tributária · Receita Federal</div>
          <div className="text-xs text-foreground/50">
            {info ? (
              <>
                {info.ade ?? "Agenda oficial"}
                {info.fonte_url?.startsWith("http") && (
                  <>
                    {" · "}
                    <a href={info.fonte_url} target="_blank" rel="noreferrer" className="underline">
                      fonte
                    </a>
                  </>
                )}
                {" · importada em "}
                {new Date(info.importado_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </>
            ) : (
              "Vencimentos oficiais do mês (ADE Corat)"
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link href={hrefAnterior} scroll={false} className="rounded-lg px-2 py-1 text-sm text-foreground/70 hover:bg-surface-muted" aria-label="Mês anterior">
            ‹
          </Link>
          <Link href={hrefAtual} scroll={false} className="min-w-[130px] rounded-lg px-2 py-1 text-center text-sm font-semibold text-foreground hover:bg-surface-muted">
            {nomeMes(mes)}
          </Link>
          <Link href={hrefProximo} scroll={false} className="rounded-lg px-2 py-1 text-sm text-foreground/70 hover:bg-surface-muted" aria-label="Próximo mês">
            ›
          </Link>
        </div>
      </div>

      {erro && (
        <div className="px-5 pt-4">
          <Alert>Não foi possível ler a agenda: {erro}</Alert>
        </div>
      )}

      {!info && !erro ? (
        <div className="px-5 py-6 text-sm text-foreground/60">
          A agenda de {nomeMes(mes)} ainda não foi importada. A Receita publica a agenda do mês seguinte por
          volta do dia 25 — a rotina diária busca sozinha assim que sair.
        </div>
      ) : info ? (
        <>
          <div className="flex flex-wrap items-center gap-2 px-5 py-3">
            <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setTodas(false)}
                className={cn("rounded-md px-2.5 py-1", !todas ? "bg-brand text-brand-foreground" : "text-foreground/70")}
              >
                Relevantes SOMA ({totalRelevantes})
              </button>
              <button
                type="button"
                onClick={() => setTodas(true)}
                className={cn("rounded-md px-2.5 py-1", todas ? "bg-brand text-brand-foreground" : "text-foreground/70")}
              >
                Todas ({linhas.length})
              </button>
            </div>
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar código ou tributo"
              className="h-8 min-w-[200px] flex-1 rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
            />
            {mes === hoje.slice(0, 7) && (
              <div className="flex gap-2 text-xs">
                <span className={cn("rounded-full px-2.5 py-1", venceHoje ? "bg-danger-soft text-danger" : "bg-surface-muted text-foreground/60")}>
                  Vence hoje: {venceHoje}
                </span>
                <span className={cn("rounded-full px-2.5 py-1", venceSemana ? "bg-warning-soft text-warning" : "bg-surface-muted text-foreground/60")}>
                  Próximos 7 dias: {venceSemana}
                </span>
              </div>
            )}
          </div>

          <div className="divide-y divide-border border-t border-border">
            {grupos.length === 0 && (
              <div className="px-5 py-6 text-sm text-foreground/60">Nenhuma obrigação com esse filtro.</div>
            )}
            {grupos.map((g) => {
              const ehHoje = g.data === hoje;
              const ehSemana = !!g.data && g.data > hoje && g.data <= fimSemana;
              const passou = !!g.data && g.data < hoje;
              return (
                <details
                  key={`${g.chave}-${busca ? "b" : ""}`}
                  open={ehHoje || ehSemana || busca.trim() !== ""}
                  className={cn(ehHoje && "bg-danger-soft/40", ehSemana && "bg-warning-soft/40")}
                >
                  <summary className="flex cursor-pointer items-center gap-3 px-5 py-2.5 text-sm">
                    <span className={cn("w-24 font-semibold", passou ? "text-foreground/40" : "text-foreground")}>
                      {g.titulo}
                    </span>
                    <span className="text-foreground/60">
                      {g.itens.length} {g.itens.length === 1 ? "obrigação" : "obrigações"}
                    </span>
                    {ehHoje && <span className="rounded-full bg-danger px-2 py-0.5 text-xs text-white">Hoje</span>}
                    {ehSemana && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning">Próximos 7 dias</span>}
                    <span className="ml-auto hidden truncate text-xs text-foreground/50 sm:block">
                      {[...new Set(g.itens.map((i) => (i.tipo === "DECLARACAO" ? i.descricao.split(/ [–-] /)[0] : i.grupo)))]
                        .filter(Boolean)
                        .slice(0, 6)
                        .join(" · ")}
                    </span>
                  </summary>
                  <div className="overflow-x-auto px-5 pb-3">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-foreground/50">
                          <th className="py-1 pr-3 font-medium">Código</th>
                          <th className="py-1 pr-3 font-medium">Tributo / obrigação</th>
                          <th className="py-1 pr-3 font-medium">Descrição</th>
                          <th className="py-1 pr-3 font-medium">Período de apuração</th>
                          <th className="py-1 font-medium">Doc.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.itens.map((i) => (
                          <tr key={i.id} className="border-t border-border/60 align-top">
                            <td className="py-1.5 pr-3 font-mono text-xs text-foreground">{i.codigo ?? "—"}</td>
                            <td className="py-1.5 pr-3 whitespace-nowrap text-foreground">
                              {i.tipo === "DECLARACAO" ? `Declaração (${i.grupo ?? "—"})` : i.grupo}
                            </td>
                            <td className="py-1.5 pr-3 text-foreground/80">
                              {i.descricao}
                              {g.chave === "outros" && i.dia_texto && (
                                <div className="text-xs text-foreground/50">Prazo: {i.dia_texto}</div>
                              )}
                            </td>
                            <td className="py-1.5 pr-3 text-foreground/70">{i.periodo ?? "—"}</td>
                            <td className="py-1.5 text-xs text-foreground/60">{i.documento ?? ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              );
            })}
          </div>
        </>
      ) : null}

      <AtualizarAgenda mes={mes} />
    </Card>
  );
}

function AtualizarAgenda({ mes }: { mes: string }) {
  const [estadoReimp, reimportar, reimportando] = useActionState<AgendaActionState, FormData>(reimportarAgendaAction, null);
  const [estadoEnvio, enviar, enviando] = useActionState<AgendaActionState, FormData>(enviarPlanilhaAgendaAction, null);
  const estado = estadoEnvio ?? estadoReimp;
  return (
    <details className="border-t border-border px-5 py-2 text-xs text-foreground/60">
      <summary className="cursor-pointer py-1">Atualizar agenda de {nomeMes(mes)}</summary>
      <div className="flex flex-wrap items-end gap-3 py-2">
        <form action={reimportar}>
          <input type="hidden" name="mes" value={mes} />
          <Button type="submit" variant="secondary" loading={reimportando}>
            Reimportar do site da Receita
          </Button>
        </form>
        <form action={enviar} className="flex items-end gap-2">
          <input type="hidden" name="mes" value={mes} />
          <input type="file" name="arquivo" accept=".xlsx" className="text-xs" />
          <Button type="submit" variant="secondary" loading={enviando}>
            Enviar planilha do ADE
          </Button>
        </form>
      </div>
      {estado?.ok && <Alert tone="success">{estado.ok}</Alert>}
      {estado?.error && <Alert>{estado.error}</Alert>}
    </details>
  );
}
