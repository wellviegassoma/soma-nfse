"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  iniciarProcessoLegalizacaoDoProspect,
  desvincularProcessoLegalizacaoDoProspect,
  type StatusProcessoLegalizacao,
} from "@/lib/actions/comercial";
import {
  STATUS_LABELS,
  STATUS_TONES,
  andamento,
  statusEfetivoProcesso,
} from "@/app/legalizacao/processos/status";
import { STATUS_PILL_CLASSES } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

// Acompanha, de dentro do card do Comercial, o processo de Abertura criado
// no módulo Legalização — sem precisar de legalizacao.ver, porque a busca
// roda via RPC security definer (ver comercial_status_processo_legalizacao).
export function ProcessoLegalizacaoCard({
  prospectId,
  status: statusInicial,
  podeEditar,
  podeVerLegalizacao,
}: {
  prospectId: string;
  status: StatusProcessoLegalizacao | null;
  podeEditar: boolean;
  podeVerLegalizacao: boolean;
}) {
  const [status, setStatus] = useState(statusInicial);
  const [prazoFinal, setPrazoFinal] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmandoDesvincular, setConfirmandoDesvincular] = useState(false);

  function iniciar() {
    setError(null);
    startTransition(async () => {
      const resultado = await iniciarProcessoLegalizacaoDoProspect(prospectId, prazoFinal || undefined);
      if (resultado?.error) {
        setError(resultado.error);
        return;
      }
      // O server action já revalida a página — mas atualizamos otimista
      // pra não esperar o próximo carregamento pra mostrar que já vinculou.
      window.location.reload();
    });
  }

  function desvincular() {
    setError(null);
    startTransition(async () => {
      try {
        await desvincularProcessoLegalizacaoDoProspect(prospectId);
        setStatus(null);
        setConfirmandoDesvincular(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível desvincular.");
      }
    });
  }

  if (!status) {
    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-foreground/70">Processo de Legalização</h3>
        <p className="text-sm text-foreground/50">
          Nenhum processo de abertura iniciado ainda no módulo Legalização.
        </p>
        {podeEditar && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-foreground/60">Prazo final (opcional)</label>
              <Input type="date" className="h-9 w-40 text-sm" value={prazoFinal} onChange={(e) => setPrazoFinal(e.target.value)} />
            </div>
            <Button type="button" variant="secondary" loading={pending} onClick={iniciar}>
              Iniciar processo de abertura
            </Button>
          </div>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }

  const fasesParaStatus = status.fases.map((f) => ({
    data_conclusao: f.data_conclusao,
    status_manual: f.status_manual as "AGUARDANDO_DADOS" | "A_CONFERIR" | "PARALISADO" | null,
    prazo: f.prazo,
  }));
  const statusEfetivo = statusEfetivoProcesso(status, fasesParaStatus);
  const progresso = andamento(fasesParaStatus);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground/70">Processo de Legalização</h3>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", STATUS_PILL_CLASSES[STATUS_TONES[statusEfetivo]])}>
          {STATUS_LABELS[statusEfetivo]}
        </span>
      </div>

      {status.arquivado_em && (
        <p className="text-xs text-warning">Esse processo foi arquivado em Legalização.</p>
      )}

      <div className="text-sm text-foreground/70">{progresso}% concluído</div>
      {status.prazo_final && (
        <div className="text-xs text-foreground/50">
          Prazo final: {new Date(status.prazo_final + "T00:00:00").toLocaleDateString("pt-BR")}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {podeVerLegalizacao ? (
          <Link href={`/legalizacao/processos/${status.processo_id}`} className="text-sm font-medium text-brand hover:underline">
            Ver processo completo →
          </Link>
        ) : (
          <span className="text-xs text-foreground/40">
            Peça acesso ao módulo Legalização pra ver o passo a passo completo.
          </span>
        )}

        {podeEditar && !confirmandoDesvincular && (
          <button
            type="button"
            className="text-xs text-foreground/40 hover:text-danger"
            onClick={() => setConfirmandoDesvincular(true)}
          >
            Desvincular
          </button>
        )}
      </div>

      {confirmandoDesvincular && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-muted/40 p-2.5 text-xs">
          <span className="text-foreground/70">Desvincular? O processo continua existindo em Legalização.</span>
          <Button type="button" variant="danger" size="md" className="h-7 px-2.5 text-xs" loading={pending} onClick={desvincular}>
            Sim, desvincular
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="md"
            className="h-7 px-2.5 text-xs"
            disabled={pending}
            onClick={() => setConfirmandoDesvincular(false)}
          >
            Cancelar
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
