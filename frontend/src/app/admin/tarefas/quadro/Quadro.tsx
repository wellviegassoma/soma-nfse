"use client";

import { useMemo, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { moverTarefaParaEtapaAction, mudarStatusTarefasAction } from "@/lib/actions/tarefas";
import { SITUACAO_CLASSE, SITUACAO_ROTULO, ddmm, situacaoTarefa, type StatusTarefa } from "@/lib/tarefas-comum";
import type { TarefaLinha } from "../TarefasLista";

type Etapa = { ordem: number; nome: string; depende_do_cliente: boolean };
type Coluna = { chave: string; titulo: string; cliente?: boolean };

/**
 * Kanban de um modelo na competência. Com etapas: uma coluna por etapa +
 * Concluída (arrastar conclui as etapas anteriores à coluna). Sem etapas:
 * colunas por status.
 */
export function Quadro({ linhas, etapas, hoje }: { linhas: TarefaLinha[]; etapas: Etapa[]; hoje: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  // Posição otimista enquanto o servidor confirma.
  const [movidas, setMovidas] = useState<Map<string, string>>(new Map());

  const comEtapas = etapas.length > 0;
  const colunas: Coluna[] = comEtapas
    ? [
        ...etapas.map((e) => ({ chave: `E${e.ordem}`, titulo: `${e.ordem}. ${e.nome}`, cliente: e.depende_do_cliente })),
        { chave: "FIM", titulo: "Concluída" },
      ]
    : [
        { chave: "A_FAZER", titulo: "A fazer" },
        { chave: "EM_ANDAMENTO", titulo: "Em andamento" },
        { chave: "CONCLUIDA", titulo: "Concluída" },
      ];

  const colunaDe = (l: TarefaLinha): string | null => {
    if (movidas.has(l.id)) return movidas.get(l.id)!;
    if (l.status === "NAO_SE_APLICA") return null;
    if (!comEtapas) return l.status;
    if (l.status === "CONCLUIDA" || !l.etapa_nome) return "FIM";
    const e = etapas.find((x) => x.nome === l.etapa_nome);
    return e ? `E${e.ordem}` : `E${etapas[0].ordem}`;
  };

  const porColuna = useMemo(() => {
    const m = new Map<string, TarefaLinha[]>();
    for (const l of linhas) {
      const c = colunaDe(l);
      if (!c) continue;
      const arr = m.get(c) ?? [];
      arr.push(l);
      m.set(c, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.empresa.localeCompare(b.empresa));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, movidas, etapas]);
  const naoSeAplica = linhas.filter((l) => l.status === "NAO_SE_APLICA" && !movidas.has(l.id)).length;

  const soltar = (chave: string) => {
    const id = arrastando;
    setArrastando(null);
    setAlvo(null);
    if (!id) return;
    const l = linhas.find((x) => x.id === id);
    if (!l || colunaDe(l) === chave) return;
    setMovidas((m) => new Map(m).set(id, chave));
    iniciar(async () => {
      const r = comEtapas
        ? await moverTarefaParaEtapaAction({ tarefaId: id, ordem: chave === "FIM" ? null : Number(chave.slice(1)) })
        : await mudarStatusTarefasAction({ ids: [id], status: chave as StatusTarefa });
      if ("error" in r) {
        setMsg(r.error);
        setMovidas((m) => {
          const n = new Map(m);
          n.delete(id);
          return n;
        });
      } else setMsg(null);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {msg && <div className="text-sm text-danger">{msg}</div>}
      <div className="text-xs text-foreground/50">
        Arraste o cartão para a coluna da etapa em que a empresa está.
        {naoSeAplica > 0 ? ` ${naoSeAplica} marcada(s) como "não se aplica" fora do quadro.` : ""}
        {pendente ? " Salvando…" : ""}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {colunas.map((c) => {
          const cartoes = porColuna.get(c.chave) ?? [];
          return (
            <div
              key={c.chave}
              onDragOver={(e) => {
                e.preventDefault();
                setAlvo(c.chave);
              }}
              onDragLeave={() => setAlvo((a) => (a === c.chave ? null : a))}
              onDrop={(e) => {
                e.preventDefault();
                soltar(c.chave);
              }}
              className={cn(
                "flex w-64 shrink-0 flex-col rounded-xl border bg-surface-muted/60",
                alvo === c.chave ? "border-brand ring-2 ring-brand/30" : "border-border",
              )}
            >
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                <span className="text-sm font-semibold text-foreground">{c.titulo}</span>
                <span className="flex items-center gap-1">
                  {c.cliente && <span className="rounded bg-sky-100 px-1 text-[10px] text-sky-900">cliente</span>}
                  <span className="rounded bg-surface px-1.5 text-xs text-foreground/60">{cartoes.length}</span>
                </span>
              </div>
              <div className="flex max-h-[65vh] flex-col gap-1.5 overflow-y-auto p-2">
                {cartoes.map((l) => {
                  const s = situacaoTarefa(l, hoje);
                  return (
                    <div
                      key={l.id}
                      draggable={!pendente}
                      onDragStart={() => setArrastando(l.id)}
                      onDragEnd={() => setArrastando(null)}
                      className={cn(
                        "cursor-grab rounded-lg border border-border bg-surface px-2.5 py-2 text-xs shadow-sm active:cursor-grabbing",
                        arrastando === l.id ? "opacity-50" : "",
                      )}
                    >
                      <div className="font-medium text-foreground">{l.empresa}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <span className={cn("rounded px-1 text-[10px] font-semibold", SITUACAO_CLASSE[s])}>{SITUACAO_ROTULO[s]}</span>
                        <span className="text-[10px] text-foreground/50">meta {ddmm(l.prazo_meta)}</span>
                        <span className="ml-auto text-[10px] text-foreground/60">{l.responsavel ?? "sem resp."}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
