"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { cn } from "@/lib/cn";
import { mudarStatusTarefasAction, reatribuirTarefasAction } from "@/lib/actions/tarefas";
import {
  apagarAnexoTarefaAction,
  comentarAction,
  detalheTarefaAction,
  salvarAnexoTarefaAction,
  type DetalheTarefa as Detalhe,
} from "@/lib/actions/tarefas-detalhe";
import { SITUACAO_CLASSE, SITUACAO_ROTULO, aberta, ddmm, rotuloCompetencia, situacaoTarefa } from "@/lib/tarefas-comum";
import { ChecklistTarefa } from "./ChecklistTarefa";
import { ROTULO_VERIFICACAO, verificarPagamentoTarefa } from "./acoesTarefa";
import type { TarefaLinha } from "./TarefasLista";

function quando(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/**
 * Painel lateral da tarefa: tudo num lugar só — situação, etapas, ações,
 * responsável, comentários, anexos e histórico.
 */
export function DetalheTarefa({ linha, hoje, aoFechar }: { linha: TarefaLinha; hoje: string; aoFechar: () => void }) {
  const [d, setD] = useState<Detalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const s = situacaoTarefa(linha, hoje);

  const carregar = useCallback(
    () =>
      detalheTarefaAction(linha.id).then((r) => {
        if ("error" in r) setErro(r.error);
        else setD(r);
      }),
    [linha.id],
  );

  useEffect(() => {
    let vivo = true;
    detalheTarefaAction(linha.id).then((r) => {
      if (!vivo) return;
      if ("error" in r) setErro(r.error);
      else setD(r);
    });
    const esc = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", esc);
    return () => {
      vivo = false;
      window.removeEventListener("keydown", esc);
    };
  }, [linha.id, aoFechar]);

  const acao = (fn: () => Promise<{ ok: true; mensagem?: string } | { error: string }>, ok: string) =>
    iniciar(async () => {
      const r = await fn();
      setMsg("error" in r ? r.error : r.mensagem ?? ok);
      await carregar();
    });

  const naoSeAplica = () => {
    const motivo = window.prompt("Por que não se aplica?");
    if (!motivo?.trim()) return;
    acao(() => mudarStatusTarefasAction({ ids: [linha.id], status: "NAO_SE_APLICA", comentario: motivo }), "Marcada como não se aplica.");
  };

  const verificar = () =>
    iniciar(async () => {
      setMsg("Consultando o pagamento na central…");
      const r = await verificarPagamentoTarefa({ id: linha.id, company_id: linha.company_id, competencia: linha.competencia, verificacao: linha.verificacao! });
      setMsg(r.mensagem);
      await carregar();
    });

  const anexar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setEnviando(true);
    try {
      const blob = await upload(`tarefas/${linha.id}/${file.name}`, file, { access: "private", handleUploadUrl: "/api/tarefas/upload" });
      const r = await salvarAnexoTarefaAction({ tarefaId: linha.id, blobUrl: blob.url, blobPathname: blob.pathname, nome: file.name });
      setMsg("error" in r ? r.error : "Anexo enviado.");
      await carregar();
    } catch {
      setMsg("Não foi possível enviar o arquivo.");
    } finally {
      setEnviando(false);
    }
  };

  const comentarios = d?.eventos.filter((e) => e.comentario) ?? [];
  const historico = d?.eventos.filter((e) => !e.comentario) ?? [];

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={aoFechar}>
      <aside
        className="flex h-full w-full max-w-xl flex-col overflow-y-auto bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Tarefa ${linha.modelo}`}
      >
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-border bg-surface px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", SITUACAO_CLASSE[s])}>{SITUACAO_ROTULO[s]}</span>
              {linha.avulsa && <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px] text-foreground/70">avulsa</span>}
              <span className="text-xs text-foreground/50">{rotuloCompetencia(linha.competencia)}</span>
            </div>
            <h2 className="mt-1 text-base font-semibold text-foreground">{linha.modelo}</h2>
            <div className="text-sm text-foreground/70">{linha.empresa}</div>
          </div>
          <button type="button" onClick={aoFechar} className="rounded-lg px-2 py-1 text-lg text-foreground/60 hover:bg-surface-muted" aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="flex flex-col gap-5 px-5 py-4">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-xs text-foreground/50">Meta SOMA</div>
              <div className="font-medium">{ddmm(linha.prazo_meta)}</div>
            </div>
            <div>
              <div className="text-xs text-foreground/50">Prazo legal</div>
              <div className="font-medium">{ddmm(linha.prazo_legal)}</div>
            </div>
            <div>
              <div className="text-xs text-foreground/50">Departamento</div>
              <div className="font-medium">{linha.departamento}</div>
            </div>
          </div>

          {d?.descricao && <p className="rounded-lg bg-surface-muted/60 px-3 py-2 text-sm text-foreground/80">{d.descricao}</p>}

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-foreground/50">Responsável</span>
            <select
              value={d?.responsavel_id ?? ""}
              disabled={!d || pendente}
              onChange={(e) =>
                acao(() => reatribuirTarefasAction({ ids: [linha.id], responsavelId: e.target.value || null }), "Responsável alterado.")
              }
              className="h-9 rounded-lg border border-border bg-surface px-2 text-sm"
            >
              <option value="">(ninguém)</option>
              {d?.equipe.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          </label>

          {linha.etapas_total > 0 && (
            <section>
              <h3 className="mb-1 text-sm font-semibold">Etapas</h3>
              <ChecklistTarefa key={d?.eventos.length ?? 0} tarefaId={linha.id} />
            </section>
          )}

          <div className="flex flex-wrap gap-2">
            {aberta(linha.status) && linha.verificacao && (
              <button
                type="button"
                disabled={pendente}
                onClick={verificar}
                className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-foreground disabled:opacity-50"
              >
                Verificar pagamento — {ROTULO_VERIFICACAO[linha.verificacao]}
              </button>
            )}
            {aberta(linha.status) && !linha.etapas_total && (
              <button
                type="button"
                disabled={pendente}
                onClick={() => acao(() => mudarStatusTarefasAction({ ids: [linha.id], status: "CONCLUIDA" }), "Concluída.")}
                className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-foreground disabled:opacity-50"
              >
                Concluir
              </button>
            )}
            {aberta(linha.status) && !linha.etapas_total && linha.status === "A_FAZER" && (
              <button
                type="button"
                disabled={pendente}
                onClick={() => acao(() => mudarStatusTarefasAction({ ids: [linha.id], status: "EM_ANDAMENTO" }), "Em andamento.")}
                className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Em andamento
              </button>
            )}
            {linha.status !== "NAO_SE_APLICA" && linha.status !== "CONCLUIDA" && (
              <button type="button" disabled={pendente} onClick={naoSeAplica} className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-50">
                Não se aplica
              </button>
            )}
            {(linha.status === "NAO_SE_APLICA" || (linha.status === "CONCLUIDA" && !linha.etapas_total)) && (
              <button
                type="button"
                disabled={pendente}
                onClick={() => acao(() => mudarStatusTarefasAction({ ids: [linha.id], status: "A_FAZER" }), "Reaberta.")}
                className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Reabrir
              </button>
            )}
          </div>
          {msg && <div className="text-sm text-foreground/70">{msg}</div>}
          {erro && <div className="text-sm text-danger">{erro}</div>}

          <section>
            <h3 className="mb-2 text-sm font-semibold">Comentários</h3>
            <div className="flex flex-col gap-2">
              {comentarios.length === 0 && <p className="text-xs text-foreground/50">Nenhum comentário.</p>}
              {[...comentarios].reverse().map((c) => (
                <div key={c.id} className="rounded-lg border border-border bg-surface px-3 py-2">
                  <div className="text-[11px] text-foreground/50">
                    {c.quem ?? "Sistema"} · {quando(c.quando)}
                  </div>
                  <div className="whitespace-pre-wrap text-sm">{c.texto}</div>
                </div>
              ))}
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                rows={3}
                placeholder="Escreva um comentário (ex.: cliente pediu para segurar a guia)"
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={pendente || !comentario.trim()}
                onClick={() =>
                  acao(async () => {
                    const r = await comentarAction({ tarefaId: linha.id, texto: comentario });
                    if (!("error" in r)) setComentario("");
                    return r;
                  }, "Comentário salvo.")
                }
                className="self-end rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-foreground disabled:opacity-50"
              >
                Comentar
              </button>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Anexos</h3>
            <ul className="flex flex-col gap-1 text-sm">
              {d?.anexos.length === 0 && <li className="text-xs text-foreground/50">Nenhum anexo.</li>}
              {d?.anexos.map((a) => (
                <li key={a.id} className="flex items-center gap-2">
                  <a href={`/api/tarefas/anexos/${a.id}`} className="text-brand hover:underline">
                    {a.nome}
                  </a>
                  <span className="text-[11px] text-foreground/45">
                    {a.quem ?? ""} · {quando(a.quando)}
                  </span>
                  <button
                    type="button"
                    disabled={pendente}
                    onClick={() => window.confirm(`Remover ${a.nome}?`) && acao(() => apagarAnexoTarefaAction(a.id), "Anexo removido.")}
                    className="ml-auto text-xs text-danger underline"
                  >
                    remover
                  </button>
                </li>
              ))}
            </ul>
            <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
              {enviando ? "Enviando…" : "Anexar arquivo"}
              <input type="file" className="hidden" disabled={enviando} onChange={anexar} accept=".pdf,.jpg,.jpeg,.png,.docx,.doc,.xlsx,.xls,.csv,.zip" />
            </label>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Histórico</h3>
            <ul className="flex flex-col gap-1 text-xs text-foreground/70">
              {historico.length === 0 && <li className="text-foreground/50">Sem movimentação.</li>}
              {historico.map((h) => (
                <li key={h.id}>
                  <span className="text-foreground/45">{quando(h.quando)}</span> · {h.quem ?? "Sistema"} — {h.texto}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </aside>
    </div>
  );
}
