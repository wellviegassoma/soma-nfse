"use client";

import { useActionState, useState } from "react";
import {
  registrarCobranca,
  vincularNotaAConta,
  desvincularNota,
} from "@/lib/actions/financeiro-cobranca";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Alert } from "@/components/ui/Alert";
import { formatarBRL, formatarDataBr } from "@/lib/financeiro";
import { CANAL_LABELS, type EtapaCobranca } from "@/lib/financeiro-cobranca";

/**
 * Uma conta a cobrar hoje, com a mensagem já montada pronta pra copiar.
 * Registrar o envio é o que faz a régua andar — por isso o botão fica junto do
 * texto, e não escondido numa tela separada.
 */
export function CobrancaConta({
  companyId,
  agendamentoId,
  descricao,
  vencimento,
  emAberto,
  contatoNome,
  etapa,
  diasAtraso,
  texto,
  notaVinculada,
  notasDisponiveis,
}: {
  companyId: string;
  agendamentoId: string;
  descricao: string | null;
  vencimento: string;
  emAberto: number;
  contatoNome: string | null;
  etapa: EtapaCobranca;
  diasAtraso: number;
  texto: string;
  notaVinculada: string | null;
  notasDisponiveis: { id: string; rotulo: string }[];
}) {
  const [stateRegistro, registrarAction, registrando] = useActionState(
    registrarCobranca,
    undefined,
  );
  const [stateVinculo, vincularAction, vinculando] = useActionState(
    vincularNotaAConta,
    undefined,
  );
  const [, desvincularAction, desvinculando] = useActionState(desvincularNota, undefined);
  const [copiado, setCopiado] = useState(false);

  const atrasada = diasAtraso > 0;

  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      {stateRegistro?.error && <Alert tone="danger">{stateRegistro.error}</Alert>}
      {stateVinculo?.error && <Alert tone="danger">{stateVinculo.error}</Alert>}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {contatoNome ?? "Sem contato"}
          </p>
          <p className="mt-0.5 text-xs text-foreground/55">
            {descricao || "Sem descrição"} · vence {formatarDataBr(vencimento)}
            {atrasada ? (
              <span className="font-medium text-danger"> · {diasAtraso} dia(s) de atraso</span>
            ) : (
              <span> · vence em {Math.abs(diasAtraso)} dia(s)</span>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-foreground">{formatarBRL(emAberto)}</p>
          <p className="text-xs text-foreground/45">em aberto</p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface-muted/40 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-foreground/70">
            {etapa.nome} · {CANAL_LABELS[etapa.canal]}
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(texto);
                setCopiado(true);
              } catch {
                // Clipboard bloqueado (contexto não seguro, permissão negada):
                // o texto continua visível e selecionável logo abaixo.
                setCopiado(false);
              }
            }}
          >
            {copiado ? "Copiado" : "Copiar mensagem"}
          </Button>
        </div>
        <p className="whitespace-pre-wrap text-sm text-foreground/80">{texto}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <form action={registrarAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="companyId" value={companyId} />
          <input type="hidden" name="agendamentoId" value={agendamentoId} />
          <input type="hidden" name="etapaId" value={etapa.id} />
          <input type="hidden" name="canal" value={etapa.canal} />
          <Button type="submit" loading={registrando}>
            Registrar como enviada
          </Button>
        </form>

        {notaVinculada ? (
          <form action={desvincularAction} className="flex items-center gap-2">
            <input type="hidden" name="companyId" value={companyId} />
            <input type="hidden" name="agendamentoId" value={agendamentoId} />
            <span className="text-xs text-success">{notaVinculada}</span>
            <Button type="submit" variant="ghost" loading={desvinculando}>
              Desvincular
            </Button>
          </form>
        ) : notasDisponiveis.length > 0 ? (
          <form action={vincularAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="companyId" value={companyId} />
            <input type="hidden" name="agendamentoId" value={agendamentoId} />
            <div className="w-72">
              <Select name="dpsId" required defaultValue="">
                <option value="" disabled>
                  Vincular NFS-e emitida...
                </option>
                {notasDisponiveis.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.rotulo}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" variant="secondary" loading={vinculando}>
              Vincular
            </Button>
          </form>
        ) : (
          <span className="text-xs text-foreground/50">
            Sem NFS-e emitida disponível para vincular.
          </span>
        )}
      </div>
    </div>
  );
}
