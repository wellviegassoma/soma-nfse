"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { STATUS_PILL_CLASSES } from "@/lib/formatters";
import {
  STATUS_LABELS,
  STATUS_TONES,
  TIPO_PROCESSO_LABELS,
  hojeSaoPaulo,
  statusEfetivoFase,
  type StatusEfetivo,
} from "./status";
import {
  concluirFase,
  reabrirFase,
  definirStatusFase,
  definirResponsavelFase,
  definirPrazoFase,
} from "@/lib/actions/legalizacao-processos";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";

export type Fase = {
  id: string;
  nome: string;
  ordem: number;
  acao: string | null;
  prazo: string | null;
  status_manual: "AGUARDANDO_DADOS" | "A_CONFERIR" | "PARALISADO" | null;
  data_conclusao: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
};

export type ProcessoLinha = {
  id: string;
  tipo_processo: string;
  nome: string;
  fluxo_nome: string;
  company_id: string | null;
  data_inicio: string;
  prazo_final: string | null;
  data_conclusao: string | null;
  responsavel_nome: string | null;
  status: StatusEfetivo;
  andamento: number;
  fases: Fase[];
};

function StatusBadge({ status }: { status: StatusEfetivo }) {
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", STATUS_PILL_CLASSES[STATUS_TONES[status]])}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function ProcessosTable({
  linhas,
  podeEditar,
  responsaveis,
}: {
  linhas: ProcessoLinha[];
  podeEditar: boolean;
  responsaveis: { id: string; full_name: string }[];
}) {
  const [expandido, setExpandido] = useState<string | null>(null);

  if (linhas.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-foreground/50">
        Nenhum processo encontrado.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="divide-y divide-border">
        {linhas.map((linha) => (
          <div key={linha.id}>
            <button
              type="button"
              onClick={() => setExpandido(expandido === linha.id ? null : linha.id)}
              className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-muted"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/legalizacao/processos/${linha.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="truncate text-sm font-semibold text-foreground hover:underline"
                  >
                    {linha.nome}
                  </Link>
                  <span className="text-xs text-foreground/40">{TIPO_PROCESSO_LABELS[linha.tipo_processo]}</span>
                </div>
                <div className="text-xs text-foreground/50">
                  {linha.fluxo_nome} · {linha.andamento}% concluído
                  {linha.responsavel_nome ? ` · ${linha.responsavel_nome}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {linha.prazo_final && (
                  <span className="text-xs text-foreground/50">
                    prazo {new Date(linha.prazo_final + "T00:00:00").toLocaleDateString("pt-BR")}
                  </span>
                )}
                <StatusBadge status={linha.status} />
                <span className="text-foreground/40">{expandido === linha.id ? "▲" : "▼"}</span>
              </div>
            </button>

            {expandido === linha.id && (
              <div className="border-t border-border bg-surface-muted/40 px-5 py-4">
                <div className="flex flex-col gap-2">
                  {linha.fases.map((fase) => (
                    <FaseRow
                      key={fase.id}
                      fase={fase}
                      processoId={linha.id}
                      prazoFinalProcesso={linha.prazo_final}
                      podeEditar={podeEditar}
                      responsaveis={responsaveis}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function FaseRow({
  fase,
  processoId,
  prazoFinalProcesso,
  podeEditar,
  responsaveis,
  onRemover,
}: {
  fase: Fase;
  processoId: string;
  prazoFinalProcesso: string | null;
  podeEditar: boolean;
  responsaveis: { id: string; full_name: string }[];
  onRemover?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dataConclusao, setDataConclusao] = useState(hojeSaoPaulo());
  const [aberto, setAberto] = useState(false);
  const router = useRouter();
  const status = statusEfetivoFase(fase, prazoFinalProcesso);

  function concluir() {
    setError(null);
    startTransition(async () => {
      try {
        const resultado = await concluirFase(fase.id, processoId, dataConclusao);
        if (resultado && "redirectTo" in resultado && resultado.redirectTo) {
          router.push(resultado.redirectTo);
        } else if (resultado && "error" in resultado) {
          setError(resultado.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível concluir.");
      }
    });
  }

  function acao(valor: string) {
    setError(null);
    startTransition(async () => {
      try {
        if (valor === "REABRIR") {
          await reabrirFase(fase.id, processoId);
        } else if (valor === "A_FAZER") {
          await definirStatusFase(fase.id, processoId, null);
        } else {
          await definirStatusFase(fase.id, processoId, valor as "AGUARDANDO_DADOS" | "A_CONFERIR" | "PARALISADO");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível atualizar.");
      }
    });
  }

  const metaPartes = [
    fase.data_conclusao && `concluída em ${new Date(fase.data_conclusao + "T00:00:00").toLocaleDateString("pt-BR")}`,
    !podeEditar && fase.responsavel_nome,
    fase.prazo && `prazo ${new Date(fase.prazo + "T00:00:00").toLocaleDateString("pt-BR")}`,
  ].filter(Boolean);

  return (
    <div className="rounded-lg border border-border bg-surface text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => podeEditar && setAberto((v) => !v)}
          className={cn("min-w-0 flex-1 text-left", podeEditar && "cursor-pointer")}
        >
          <span className="font-medium text-foreground">{fase.ordem} — {fase.nome}</span>
          {metaPartes.length > 0 && (
            <span className="ml-2 text-xs text-foreground/40">{metaPartes.join(" · ")}</span>
          )}
        </button>

        <div className="flex shrink-0 items-center gap-2">
          {podeEditar && (
            <Select
              className="h-8 w-36 text-xs"
              value={fase.responsavel_id ?? ""}
              disabled={pending}
              onChange={(e) => {
                setError(null);
                startTransition(() => definirResponsavelFase(fase.id, processoId, e.target.value || null));
              }}
            >
              <option value="">Sem responsável</option>
              {responsaveis.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name}
                </option>
              ))}
            </Select>
          )}

          {podeEditar &&
            (fase.data_conclusao ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(() => reabrirFase(fase.id, processoId))}
                className="h-8 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground/70 hover:bg-surface-muted disabled:opacity-50"
              >
                Reabrir
              </button>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={concluir}
                className="h-8 rounded-lg bg-brand px-2.5 text-xs font-medium text-brand-foreground hover:bg-brand-hover disabled:opacity-50"
              >
                Concluir hoje
              </button>
            ))}

          <StatusBadge status={status} />
          {podeEditar && (
            <button
              type="button"
              onClick={() => setAberto((v) => !v)}
              className="text-xs text-foreground/40 hover:text-foreground/70"
              title="Mais opções"
            >
              {aberto ? "▲" : "▼"}
            </button>
          )}
        </div>
      </div>

      {podeEditar && aberto && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2.5">
          <span className="text-xs text-foreground/50">Prazo desta fase</span>
          <Input
            type="date"
            className="h-8 w-36 text-xs"
            value={fase.prazo ?? ""}
            disabled={pending}
            onChange={(e) => {
              setError(null);
              startTransition(() => definirPrazoFase(fase.id, processoId, e.target.value || null));
            }}
          />

          {!fase.data_conclusao && (
            <>
              <span className="ml-2 text-xs text-foreground/50">Concluir em outra data</span>
              <Input
                type="date"
                className="h-8 w-36 text-xs"
                value={dataConclusao}
                disabled={pending}
                onChange={(e) => setDataConclusao(e.target.value)}
              />
              <button
                type="button"
                disabled={pending}
                onClick={concluir}
                className="h-8 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground/70 hover:bg-surface-muted disabled:opacity-50"
              >
                Concluir
              </button>

              <Select
                className="ml-2 h-8 w-40 text-xs"
                value=""
                disabled={pending}
                onChange={(e) => {
                  if (e.target.value) acao(e.target.value);
                  e.target.value = "";
                }}
              >
                <option value="">Status...</option>
                <option value="AGUARDANDO_DADOS">Aguardando dados</option>
                <option value="A_CONFERIR">A conferir</option>
                <option value="PARALISADO">Paralisar</option>
                {fase.status_manual && <option value="A_FAZER">Voltar pra A fazer</option>}
              </Select>
            </>
          )}
          {onRemover && (
            <button
              type="button"
              disabled={pending}
              onClick={onRemover}
              className="h-8 rounded-lg px-2 text-xs font-medium text-danger hover:bg-danger-soft disabled:opacity-50"
            >
              Remover
            </button>
          )}
        </div>
      )}
      {error && <p className="px-3 pb-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
