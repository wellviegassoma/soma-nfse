"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatarCpf } from "@/lib/formatters";
import { atualizarDeclaracaoAction } from "@/lib/actions/irpf";
import { ETAPAS_QUADRO, ETAPA_CLIENTE, STATUS_LABEL, type StatusDeclaracao } from "@/lib/irpf/comum";

export type CartaoDeclaracao = {
  id: string;
  nome: string;
  cpf: string;
  status: StatusDeclaracao;
  responsavel: string | null;
  docsOk: number;
  docsTotal: number;
  arquivos: number;
  resultado: string | null; // texto curto ("Pagar R$ …")
  resultadoTom: "danger" | "success" | null;
};

/**
 * Kanban das declarações do exercício: uma coluna por etapa do fluxo.
 * Arrastar o cartão muda a situação (fica no histórico da declaração).
 */
export function QuadroDeclaracoes({ cartoes }: { cartoes: CartaoDeclaracao[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<StatusDeclaracao | null>(null);
  const [pendente, iniciar] = useTransition();
  const [movidas, setMovidas] = useState<Map<string, StatusDeclaracao>>(new Map());

  const statusDe = (c: CartaoDeclaracao) => movidas.get(c.id) ?? c.status;

  const porColuna = useMemo(() => {
    const m = new Map<StatusDeclaracao, CartaoDeclaracao[]>();
    for (const c of cartoes) {
      const s = movidas.get(c.id) ?? c.status;
      const arr = m.get(s) ?? [];
      arr.push(c);
      m.set(s, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.nome.localeCompare(b.nome));
    return m;
  }, [cartoes, movidas]);
  const naoFara = porColuna.get("NAO_FARA")?.length ?? 0;

  const soltar = (destino: StatusDeclaracao) => {
    const id = arrastando;
    setArrastando(null);
    setAlvo(null);
    if (!id) return;
    const c = cartoes.find((x) => x.id === id);
    if (!c || statusDe(c) === destino) return;
    setMovidas((m) => new Map(m).set(id, destino));
    iniciar(async () => {
      const r = await atualizarDeclaracaoAction({ id, status: destino });
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
        Arraste o cartão para a etapa em que a declaração está. Clique no nome para abrir.
        {naoFara > 0 ? ` ${naoFara} marcada(s) como "não fará" fora do quadro.` : ""}
        {pendente ? " Salvando…" : ""}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {ETAPAS_QUADRO.map((etapa, i) => {
          const lista = porColuna.get(etapa) ?? [];
          return (
            <div
              key={etapa}
              onDragOver={(e) => {
                e.preventDefault();
                setAlvo(etapa);
              }}
              onDragLeave={() => setAlvo((a) => (a === etapa ? null : a))}
              onDrop={(e) => {
                e.preventDefault();
                soltar(etapa);
              }}
              className={cn(
                "flex w-60 shrink-0 flex-col rounded-xl border bg-surface-muted/60",
                alvo === etapa ? "border-brand ring-2 ring-brand/30" : "border-border",
              )}
            >
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                <span className="text-sm font-semibold text-foreground">
                  {i + 1}. {STATUS_LABEL[etapa]}
                </span>
                <span className="flex items-center gap-1">
                  {ETAPA_CLIENTE[etapa] && <span className="rounded bg-sky-100 px-1 text-[10px] text-sky-900">cliente</span>}
                  <span className="rounded bg-surface px-1.5 text-xs text-foreground/60">{lista.length}</span>
                </span>
              </div>
              <div className="flex max-h-[65vh] flex-col gap-1.5 overflow-y-auto p-2">
                {lista.map((c) => (
                  <div
                    key={c.id}
                    draggable={!pendente}
                    onDragStart={() => setArrastando(c.id)}
                    onDragEnd={() => setArrastando(null)}
                    className={cn(
                      "cursor-grab rounded-lg border border-border bg-surface px-2.5 py-2 text-xs shadow-sm active:cursor-grabbing",
                      arrastando === c.id ? "opacity-50" : "",
                    )}
                  >
                    <Link href={`/irpf/declaracoes/${c.id}`} className="font-medium text-foreground hover:text-brand" draggable={false}>
                      {c.nome}
                    </Link>
                    <div className="text-[10px] text-foreground/45">CPF {formatarCpf(c.cpf)}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-foreground/55">
                      {c.docsTotal > 0 && (
                        <span className={c.docsOk === c.docsTotal ? "text-success" : ""}>
                          docs {c.docsOk}/{c.docsTotal}
                        </span>
                      )}
                      {c.arquivos > 0 && <span>{c.arquivos} arq.</span>}
                      {c.resultado && (
                        <span className={cn(c.resultadoTom === "danger" && "text-danger", c.resultadoTom === "success" && "text-success")}>
                          {c.resultado}
                        </span>
                      )}
                      <span className="ml-auto">{c.responsavel ?? "sem resp."}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
