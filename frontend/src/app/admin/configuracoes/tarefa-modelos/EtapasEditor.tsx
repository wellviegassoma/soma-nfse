"use client";

import { useState, useTransition } from "react";
import { salvarEtapasModeloAction, type EtapaModeloInput } from "@/lib/actions/tarefas";
import { FONTES_ROTULO } from "@/lib/tarefas-comum";

type Opcao = { id: string; nome: string };

/**
 * Etapas do modelo (Fase 2). Departamento vazio = mesmo da etapa anterior
 * (checklist); outro departamento = cascata (a tarefa passa para o
 * responsável dele na carteira). "Cliente" = etapa que depende do cliente.
 */
export function EtapasEditor({
  modeloId,
  iniciais,
  departamentos,
}: {
  modeloId: string;
  iniciais: EtapaModeloInput[];
  departamentos: Opcao[];
}) {
  const [etapas, setEtapas] = useState<EtapaModeloInput[]>(iniciais);
  const [msg, setMsg] = useState<{ ok?: string; erro?: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const campo = "h-8 rounded-lg border border-border bg-surface px-2 text-xs text-foreground";

  const set = (i: number, k: keyof EtapaModeloInput, v: unknown) =>
    setEtapas((l) => l.map((e, j) => (j === i ? { ...e, [k]: v } : e)));
  const mover = (i: number, d: -1 | 1) =>
    setEtapas((l) => {
      const n = [...l];
      const j = i + d;
      if (j < 0 || j >= n.length) return l;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const salvar = () =>
    iniciar(async () => {
      const r = await salvarEtapasModeloAction({ modeloId, etapas });
      setMsg("error" in r ? { erro: r.error } : { ok: r.mensagem ?? "Etapas salvas." });
    });

  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <legend className="px-1 text-xs font-semibold text-foreground/70">Etapas (checklist e cascata)</legend>
      <p className="text-xs text-foreground/50">
        Departamento vazio = mesmo da etapa anterior. Outro departamento = ao chegar nessa etapa a tarefa passa para o
        responsável dele. &quot;Cliente&quot; = se só faltarem etapas assim, a tarefa fica &quot;Aguardando cliente&quot;.
      </p>
      {etapas.map((e, i) => (
        <div key={e.id ?? `nova-${i}`} className="flex flex-wrap items-center gap-2">
          <span className="w-5 text-right text-xs text-foreground/50">{i + 1}.</span>
          <input
            value={e.nome}
            onChange={(ev) => set(i, "nome", ev.target.value)}
            placeholder="Nome da etapa"
            className={`${campo} min-w-[200px] flex-1`}
          />
          <select value={e.departamento_id ?? ""} onChange={(ev) => set(i, "departamento_id", ev.target.value || null)} className={campo}>
            <option value="">(mesmo depto.)</option>
            {departamentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </select>
          <select value={e.fonte_automatica ?? ""} onChange={(ev) => set(i, "fonte_automatica", ev.target.value || null)} className={campo}>
            <option value="">Manual</option>
            {Object.entries(FONTES_ROTULO).map(([k, r]) => (
              <option key={k} value={k}>
                Auto: {r}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={e.depende_do_cliente} onChange={(ev) => set(i, "depende_do_cliente", ev.target.checked)} />
            Cliente
          </label>
          <button type="button" onClick={() => mover(i, -1)} className="text-xs text-foreground/60" aria-label="Subir">
            ↑
          </button>
          <button type="button" onClick={() => mover(i, 1)} className="text-xs text-foreground/60" aria-label="Descer">
            ↓
          </button>
          <button
            type="button"
            onClick={() => setEtapas((l) => l.filter((_, j) => j !== i))}
            className="text-xs text-danger underline"
          >
            remover
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setEtapas((l) => [...l, { id: null, nome: "", departamento_id: null, fonte_automatica: null, depende_do_cliente: false }])}
          className="rounded-lg border border-border px-2.5 py-1 text-xs"
        >
          + Etapa
        </button>
        <button
          type="button"
          onClick={salvar}
          disabled={pendente}
          className="rounded-lg bg-brand px-3 py-1 text-xs font-medium text-brand-foreground disabled:opacity-50"
        >
          {pendente ? "Salvando…" : "Salvar etapas"}
        </button>
        {msg && <span className={msg.erro ? "text-xs text-danger" : "text-xs text-success"}>{msg.erro ?? msg.ok}</span>}
      </div>
    </fieldset>
  );
}
