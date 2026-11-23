"use client";

import { useMemo, useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { mudarStatusTarefasAction } from "@/lib/actions/tarefas";
import {
  SITUACAO_CLASSE,
  SITUACAO_ROTULO,
  STATUS_ROTULO,
  ddmm,
  situacaoTarefa,
  type Situacao,
  type StatusTarefa,
} from "@/lib/tarefas-comum";
import type { TarefaLinha } from "../TarefasLista";

// Símbolo curto na célula para a grade inteira caber na tela.
const SIGLA: Record<Situacao, string> = {
  CONCLUIDA: "✓",
  NAO_SE_APLICA: "–",
  RISCO: "!",
  ATRASADA: "A",
  HOJE: "H",
  SEMANA: "7",
  DEPOIS: "·",
  SEM_PRAZO: "?",
};

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function GradeEmpresas({ linhas, hoje }: { linhas: TarefaLinha[]; hoje: string }) {
  const [busca, setBusca] = useState("");
  const [depto, setDepto] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const departamentos = useMemo(
    () => [...new Map(linhas.map((l) => [l.departamento_id, l.departamento])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [linhas],
  );
  const filtradas = useMemo(() => linhas.filter((l) => !depto || l.departamento_id === depto), [linhas, depto]);
  const modelos = useMemo(
    () =>
      [...new Map(filtradas.map((l) => [l.modelo_id, { id: l.modelo_id, nome: l.modelo, ordem: l.ordem }])).values()].sort(
        (a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome),
      ),
    [filtradas],
  );
  const empresas = useMemo(() => {
    const q = semAcento(busca.trim());
    const m = new Map<string, { id: string; nome: string; tarefas: Map<string, TarefaLinha> }>();
    for (const l of filtradas) {
      if (q && !semAcento(l.empresa).includes(q)) continue;
      const e = m.get(l.company_id) ?? { id: l.company_id, nome: l.empresa, tarefas: new Map() };
      e.tarefas.set(l.modelo_id, l);
      m.set(l.company_id, e);
    }
    return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  }, [filtradas, busca]);

  const tarefaAberta = aberta ? linhas.find((l) => l.id === aberta) ?? null : null;

  const mudar = (status: StatusTarefa) => {
    if (!tarefaAberta) return;
    let comentario: string | null = null;
    if (status === "NAO_SE_APLICA") {
      comentario = window.prompt("Por que não se aplica?");
      if (!comentario?.trim()) return;
    }
    iniciar(async () => {
      const r = await mudarStatusTarefasAction({ ids: [tarefaAberta.id], status, comentario });
      setMsg("error" in r ? r.error : null);
      if (!("error" in r)) setAberta(null);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar empresa"
          className="h-8 w-60 rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
        />
        <select
          value={depto}
          onChange={(e) => setDepto(e.target.value)}
          className="h-8 rounded-lg border border-border bg-surface px-2 text-sm text-foreground"
        >
          <option value="">Todos os departamentos</option>
          {departamentos.map(([id, nome]) => (
            <option key={id} value={id}>
              {nome}
            </option>
          ))}
        </select>
        <div className="ml-auto flex flex-wrap gap-1.5 text-[11px]">
          {(Object.keys(SIGLA) as Situacao[]).map((s) => (
            <span key={s} className={cn("rounded px-1.5 py-0.5 font-semibold", SITUACAO_CLASSE[s])}>
              {SIGLA[s]} {SITUACAO_ROTULO[s]}
            </span>
          ))}
        </div>
      </div>

      {tarefaAberta && (
        <Card className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
          <div className="min-w-60 flex-1">
            <div className="font-semibold">{tarefaAberta.modelo}</div>
            <div className="text-xs text-foreground/60">
              {tarefaAberta.empresa} · {STATUS_ROTULO[tarefaAberta.status]} · meta {ddmm(tarefaAberta.prazo_meta)} · prazo legal{" "}
              {ddmm(tarefaAberta.prazo_legal)} · {tarefaAberta.responsavel ?? "sem responsável"}
              {tarefaAberta.comentario ? ` · ${tarefaAberta.comentario}` : ""}
            </div>
          </div>
          {(["CONCLUIDA", "EM_ANDAMENTO", "NAO_SE_APLICA", "A_FAZER"] as StatusTarefa[])
            .filter((s) => s !== tarefaAberta.status)
            .map((s) => (
              <button
                key={s}
                type="button"
                disabled={pendente}
                onClick={() => mudar(s)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium disabled:opacity-50",
                  s === "CONCLUIDA" ? "bg-brand text-brand-foreground" : "border border-border bg-surface",
                )}
              >
                {s === "A_FAZER" ? "Reabrir" : s === "CONCLUIDA" ? "Concluir" : STATUS_ROTULO[s]}
              </button>
            ))}
          <button type="button" onClick={() => setAberta(null)} className="text-xs text-foreground/60 underline">
            fechar
          </button>
          {msg && <div className="w-full text-xs text-danger">{msg}</div>}
        </Card>
      )}

      <Card className="overflow-auto">
        {empresas.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-foreground/60">Nenhuma tarefa nessa competência.</div>
        ) : (
          <table className="text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="sticky left-0 z-[1] min-w-[240px] bg-surface px-3 py-2 text-left align-bottom font-medium text-foreground/50">
                  Empresa ({empresas.length})
                </th>
                {modelos.map((m) => (
                  <th key={m.id} className="h-40 w-9 px-0.5 align-bottom font-medium text-foreground/60">
                    <div className="mx-auto w-5 rotate-180 whitespace-nowrap text-left [writing-mode:vertical-rl]" title={m.nome}>
                      {m.nome.length > 32 ? m.nome.slice(0, 31) + "…" : m.nome}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {empresas.map((e) => (
                <tr key={e.id} className="border-b border-border/50">
                  <td className="sticky left-0 z-[1] max-w-[280px] truncate bg-surface px-3 py-1 text-foreground/85" title={e.nome}>
                    {e.nome}
                  </td>
                  {modelos.map((m) => {
                    const t = e.tarefas.get(m.id);
                    if (!t) return <td key={m.id} className="px-0.5 py-1" />;
                    const s = situacaoTarefa(t, hoje);
                    return (
                      <td key={m.id} className="px-0.5 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => setAberta(t.id)}
                          title={`${m.nome} — ${SITUACAO_ROTULO[s]}`}
                          className={cn("h-6 w-7 rounded font-bold", SITUACAO_CLASSE[s], aberta === t.id ? "ring-2 ring-foreground" : "")}
                        >
                          {SIGLA[s]}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
