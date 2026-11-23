"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { aplicarRegeracaoAction, previaRegeracaoAction } from "@/lib/actions/tarefas";
import { STATUS_ROTULO, rotuloCompetencia } from "@/lib/tarefas-comum";
import type { PreviaRegeracao } from "@/lib/tarefas";

/**
 * "Gerar novamente" com revisão: mostra quais tarefas já geradas não batem
 * mais com o cadastro atual (e por quê) e quais faltam. Só apaga o que for
 * marcado aqui — e o servidor confere de novo antes de apagar.
 */
export function RevisarGeracao({
  competenciaInicial,
  modelos,
  aoFechar,
}: {
  competenciaInicial: string;
  modelos: { id: string; nome: string }[];
  aoFechar: () => void;
}) {
  const [competencia, setCompetencia] = useState(competenciaInicial);
  const [modeloId, setModeloId] = useState("");
  const [previa, setPrevia] = useState<PreviaRegeracao | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [criar, setCriar] = useState(true);
  const [verCriar, setVerCriar] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; erro?: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const carregar = () =>
    iniciar(async () => {
      setMsg(null);
      const r = await previaRegeracaoAction({ competencia, modeloId: modeloId || null });
      if ("error" in r) return setMsg({ erro: r.error });
      setPrevia(r);
      setMarcadas(new Set(r.remover.filter((x) => x.sugerida).map((x) => x.id)));
    });

  const aplicar = () => {
    if (!previa) return;
    const n = marcadas.size;
    const texto =
      `Excluir ${n} tarefa(s) de ${rotuloCompetencia(previa.competencia)}` +
      (criar ? ` e criar ${previa.criar.length} que faltam` : "") +
      "? A exclusão não pode ser desfeita.";
    if (!window.confirm(texto)) return;
    iniciar(async () => {
      const r = await aplicarRegeracaoAction({
        competencia: previa.competencia,
        modeloId: modeloId || null,
        removerIds: [...marcadas],
        criarFaltantes: criar,
      });
      if ("error" in r) return setMsg({ erro: r.error });
      setMsg({ ok: r.mensagem });
      const nova = await previaRegeracaoAction({ competencia, modeloId: modeloId || null });
      if (!("error" in nova)) {
        setPrevia(nova);
        setMarcadas(new Set(nova.remover.filter((x) => x.sugerida).map((x) => x.id)));
      }
    });
  };

  const alternar = (id: string) =>
    setMarcadas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Card className="flex flex-col gap-3 border-brand/40 p-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="text-sm font-semibold">Revisar e gerar novamente</div>
        <label className="flex flex-col gap-1 text-xs text-foreground/60">
          Competência
          <input
            type="month"
            value={competencia}
            onChange={(e) => {
              setCompetencia(e.target.value);
              setPrevia(null);
            }}
            className="h-8 rounded-lg border border-border bg-surface px-2 text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground/60">
          Modelo
          <select
            value={modeloId}
            onChange={(e) => {
              setModeloId(e.target.value);
              setPrevia(null);
            }}
            className="h-8 max-w-xs rounded-lg border border-border bg-surface px-2 text-sm text-foreground"
          >
            <option value="">Todos os modelos</option>
            {modelos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={carregar}
          disabled={pendente || !competencia}
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-foreground disabled:opacity-50"
        >
          {pendente && !previa ? "Calculando…" : "Ver o que muda"}
        </button>
        <button type="button" onClick={aoFechar} className="ml-auto text-xs text-foreground/60 underline">
          fechar
        </button>
      </div>
      <p className="text-xs text-foreground/55">
        Compara as tarefas já geradas com o cadastro atual dos modelos. Nada é apagado sem você marcar e confirmar.
        Vêm marcadas só as que ninguém mexeu (A fazer, sem etapa feita, sem ação de ninguém).
      </p>
      {msg && <div className={cn("text-sm", msg.erro ? "text-danger" : "text-success")}>{msg.erro ?? msg.ok}</div>}

      {previa && (
        <>
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="text-sm font-semibold text-rose-900">
              Vão ser excluídas: {marcadas.size} de {previa.remover.length} que não batem mais com o cadastro
            </span>
            {previa.remover.length > 0 && (
              <>
                <button type="button" onClick={() => setMarcadas(new Set(previa.remover.map((x) => x.id)))} className="text-xs text-brand underline">
                  marcar todas
                </button>
                <button
                  type="button"
                  onClick={() => setMarcadas(new Set(previa.remover.filter((x) => x.sugerida).map((x) => x.id)))}
                  className="text-xs text-brand underline"
                >
                  só as sugeridas
                </button>
                <button type="button" onClick={() => setMarcadas(new Set())} className="text-xs text-brand underline">
                  desmarcar
                </button>
              </>
            )}
          </div>
          {previa.remover.length > 0 ? (
            <div className="max-h-[420px] overflow-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-border text-left text-xs text-foreground/50">
                    <th className="w-8 px-3 py-2" />
                    <th className="px-2 py-2 font-medium">Tarefa</th>
                    <th className="px-2 py-2 font-medium">Empresa</th>
                    <th className="px-2 py-2 font-medium">Motivo</th>
                    <th className="px-2 py-2 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.remover.map((x) => (
                    <tr key={x.id} className={cn("border-b border-border/60", marcadas.has(x.id) ? "bg-rose-50" : "")}>
                      <td className="px-3 py-1.5">
                        <input type="checkbox" checked={marcadas.has(x.id)} onChange={() => alternar(x.id)} aria-label="Excluir" />
                      </td>
                      <td className="px-2 py-1.5">{x.modelo}</td>
                      <td className="px-2 py-1.5">{x.empresa}</td>
                      <td className="px-2 py-1.5 text-xs text-foreground/70">{x.motivo}</td>
                      <td className="px-2 py-1.5 text-xs">
                        {STATUS_ROTULO[x.status]}
                        {x.etapasFeitas > 0 && <span className="ml-1 rounded bg-amber-100 px-1 text-amber-900">{x.etapasFeitas} etapa(s) feita(s)</span>}
                        {x.mexidaPorAlguem && <span className="ml-1 rounded bg-amber-100 px-1 text-amber-900">alguém já mexeu</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-foreground/60">Nenhuma tarefa sobrando — tudo bate com o cadastro.</p>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="text-sm font-semibold text-success">Vão ser criadas: {previa.criar.length}</span>
            {previa.criar.length > 0 && (
              <button type="button" onClick={() => setVerCriar(!verCriar)} className="text-xs text-brand underline">
                {verCriar ? "esconder" : "ver lista"}
              </button>
            )}
            <label className="ml-auto flex items-center gap-2 text-sm">
              <input type="checkbox" checked={criar} onChange={(e) => setCriar(e.target.checked)} />
              Criar as que faltam
            </label>
          </div>
          {verCriar && (
            <ul className="max-h-48 overflow-auto rounded-lg border border-border p-2 text-xs">
              {previa.criar.map((c, i) => (
                <li key={i}>
                  {c.modelo} · {c.empresa}
                </li>
              ))}
            </ul>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={aplicar}
              disabled={pendente || (marcadas.size === 0 && !(criar && previa.criar.length))}
              className="rounded-lg bg-danger px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {pendente ? "Aplicando…" : `Excluir ${marcadas.size}${criar && previa.criar.length ? ` e criar ${previa.criar.length}` : ""}`}
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
