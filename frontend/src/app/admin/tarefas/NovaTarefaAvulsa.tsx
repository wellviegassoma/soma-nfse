"use client";

import { useState, useTransition } from "react";
import { criarTarefaAvulsaAction, opcoesTarefaAvulsaAction, type OpcoesAvulsa } from "@/lib/actions/tarefas-detalhe";

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Demanda pontual de uma empresa (intimação, alteração, pedido do cliente) — sem modelo. */
export function NovaTarefaAvulsa({ hoje, companyId }: { hoje: string; companyId?: string }) {
  const [aberto, setAberto] = useState(false);
  const [op, setOp] = useState<OpcoesAvulsa | null>(null);
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState({ companyId: companyId ?? "", titulo: "", descricao: "", departamentoId: "", responsavelId: "", prazo: hoje, prazoLegal: "" });
  const [msg, setMsg] = useState<{ ok?: string; erro?: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const abrir = () => {
    setAberto(true);
    setMsg(null);
    if (!op) iniciar(async () => setOp(await opcoesTarefaAvulsaAction()));
  };

  const salvar = () =>
    iniciar(async () => {
      const r = await criarTarefaAvulsaAction({
        companyId: form.companyId,
        titulo: form.titulo,
        descricao: form.descricao || null,
        departamentoId: form.departamentoId,
        responsavelId: form.responsavelId || null,
        prazo: form.prazo,
        prazoLegal: form.prazoLegal || null,
      });
      if ("error" in r) return setMsg({ erro: r.error });
      setMsg({ ok: "Tarefa criada." });
      setForm((f) => ({ ...f, titulo: "", descricao: "", ...(companyId ? {} : { companyId: "" }) }));
    });

  const campo = "h-9 w-full rounded-lg border border-border bg-surface px-2 text-sm text-foreground";
  const empresas = (op?.empresas ?? []).filter((e) => !busca || semAcento(e.nome).includes(semAcento(busca)));

  return (
    <>
      <button type="button" onClick={abrir} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground">
        + Tarefa avulsa
      </button>
      {aberto && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/30 p-4" onClick={() => setAberto(false)}>
          <div className="mt-16 w-full max-w-lg rounded-xl bg-background p-5 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Nova tarefa avulsa">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Nova tarefa avulsa</h2>
              <button type="button" onClick={() => setAberto(false)} className="text-lg text-foreground/60" aria-label="Fechar">
                ×
              </button>
            </div>
            {!op ? (
              <p className="text-sm text-foreground/60">Carregando…</p>
            ) : (
              <div className="flex flex-col gap-3 text-sm">
                {!companyId && (
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-foreground/60">Empresa</span>
                    <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar empresas…" className={campo} />
                    <select value={form.companyId} onChange={(e) => set("companyId", e.target.value)} className={campo} size={5}>
                      {empresas.slice(0, 300).map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-foreground/60">O que fazer</span>
                  <input value={form.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="ex.: Responder intimação da Receita" className={campo} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-foreground/60">Detalhes (opcional)</span>
                  <textarea value={form.descricao} onChange={(e) => set("descricao", e.target.value)} rows={3} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-foreground/60">Departamento</span>
                    <select value={form.departamentoId} onChange={(e) => set("departamentoId", e.target.value)} className={campo}>
                      <option value="">—</option>
                      {op.departamentos.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-foreground/60">Responsável</span>
                    <select value={form.responsavelId} onChange={(e) => set("responsavelId", e.target.value)} className={campo}>
                      <option value="">Carteira da empresa</option>
                      {op.equipe.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-foreground/60">Prazo (meta)</span>
                    <input type="date" value={form.prazo} onChange={(e) => set("prazo", e.target.value)} className={campo} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-foreground/60">Prazo legal (opcional)</span>
                    <input type="date" value={form.prazoLegal} onChange={(e) => set("prazoLegal", e.target.value)} className={campo} />
                  </label>
                </div>
                {msg && <div className={msg.erro ? "text-danger" : "text-success"}>{msg.erro ?? msg.ok}</div>}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setAberto(false)} className="rounded-lg border border-border px-3 py-1.5">
                    Fechar
                  </button>
                  <button type="button" onClick={salvar} disabled={pendente} className="rounded-lg bg-brand px-3 py-1.5 font-medium text-brand-foreground disabled:opacity-50">
                    {pendente ? "Criando…" : "Criar tarefa"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
