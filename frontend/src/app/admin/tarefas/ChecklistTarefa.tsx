"use client";

import { useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { etapasDaTarefaAction, marcarEtapaAction, type EtapaTarefa } from "@/lib/actions/tarefas";

/** Etapas de uma tarefa, marcáveis. Carrega sob demanda (ao abrir a linha). */
export function ChecklistTarefa({ tarefaId, horizontal = false }: { tarefaId: string; horizontal?: boolean }) {
  const [etapas, setEtapas] = useState<EtapaTarefa[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const carregar = () =>
    etapasDaTarefaAction(tarefaId).then((r) => {
      if ("error" in r) setErro(r.error);
      else setEtapas(r.etapas);
    });

  useEffect(() => {
    let vivo = true;
    etapasDaTarefaAction(tarefaId).then((r) => {
      if (!vivo) return;
      if ("error" in r) setErro(r.error);
      else setEtapas(r.etapas);
    });
    return () => {
      vivo = false;
    };
  }, [tarefaId]);

  const marcar = (e: EtapaTarefa) =>
    iniciar(async () => {
      const r = await marcarEtapaAction({ tarefaId, etapaId: e.etapa_id, feita: !e.concluida_em });
      if ("error" in r) setErro(r.error);
      else await carregar();
    });

  if (erro) return <div className="mt-2 text-xs text-danger">{erro}</div>;
  if (!etapas) return <div className="mt-2 text-xs text-foreground/50">Carregando etapas…</div>;
  if (!etapas.length) return <div className="mt-2 text-xs text-foreground/50">Sem etapas.</div>;
  const proxima = etapas.find((e) => !e.concluida_em)?.etapa_id;

  return (
    <ol
      className={cn(
        "mt-1 flex gap-1.5 rounded-lg border border-border bg-surface p-2",
        horizontal ? "flex-wrap items-stretch" : "flex-col",
      )}
    >
      {etapas.map((e) => (
        <li
          key={e.etapa_id}
          className={cn(
            "flex flex-wrap items-center gap-2 text-xs",
            horizontal ? "min-w-[200px] flex-1 rounded-md border border-border/70 px-2 py-1.5" : "",
          )}
        >
          <input
            type="checkbox"
            checked={!!e.concluida_em}
            disabled={pendente || (e.pagamento && !e.concluida_em)}
            title={e.pagamento && !e.concluida_em ? "Só conclui pelo botão Verificar pagamento" : undefined}
            onChange={() => marcar(e)}
            aria-label={e.nome}
          />
          <span className={cn(e.concluida_em ? "text-foreground/50 line-through" : "text-foreground", e.etapa_id === proxima ? "font-semibold" : "")}>
            {e.ordem}. {e.nome}
          </span>
          {e.departamento && <span className="rounded bg-surface px-1 text-[10px] text-foreground/60">{e.departamento}</span>}
          {e.depende_do_cliente && <span className="rounded bg-sky-100 px-1 text-[10px] text-sky-900">cliente</span>}
          {e.fonte && (
            <span className="rounded bg-violet-100 px-1 text-[10px] text-violet-800" title="Conclui sozinha pela central">
              auto: {e.fonte}
            </span>
          )}
          {e.concluida_em && (
            <span className="text-[10px] text-foreground/45">
              {e.automatica ? "pela central · " : ""}
              {new Date(e.concluida_em).toLocaleDateString("pt-BR")}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
