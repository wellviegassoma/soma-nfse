"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { aprovarConferenciaSimples, desfazerAprovacaoConferenciaSimples } from "@/lib/actions/conferencia-simples";
import type { ResultadoConferencia } from "@/lib/simples-conferencia";

type Aprovacao = { assinatura: string; aprovadoEm: string; aprovadoPorNome: string | null; observacao: string | null };

const ESTILO_STATUS = {
  OK: "bg-success-soft text-success",
  REVISAR: "bg-warning-soft text-warning",
  BLOQUEADO: "bg-danger-soft text-danger",
} as const;

export function CelulaConferencia({
  companyId,
  competencia,
  conferencia,
  assinatura,
  liberado,
  aprovacao,
}: {
  companyId: string;
  competencia: string;
  conferencia: ResultadoConferencia;
  assinatura: string;
  liberado: boolean;
  aprovacao: Aprovacao | null;
}) {
  const [aberto, setAberto] = useState(false);
  const [aprovando, setAprovando] = useState(false);
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const aprovadaValida = conferencia.status === "REVISAR" && liberado && aprovacao !== null;
  const aprovacaoVencida = conferencia.status === "REVISAR" && !liberado && aprovacao !== null;

  const rotulo =
    conferencia.status === "OK"
      ? "OK"
      : conferencia.status === "BLOQUEADO"
        ? "Bloqueada"
        : aprovadaValida
          ? "Aprovada"
          : aprovacaoVencida
            ? "Revisar de novo"
            : "Revisar";
  const estilo = aprovadaValida ? ESTILO_STATUS.OK : ESTILO_STATUS[conferencia.status];

  function aprovar() {
    setErro(null);
    startTransition(async () => {
      const r = await aprovarConferenciaSimples(companyId, competencia, assinatura, observacao);
      if (!r.ok) setErro(r.erro);
      else {
        setAprovando(false);
        setObservacao("");
      }
    });
  }

  function desfazer() {
    setErro(null);
    startTransition(async () => {
      const r = await desfazerAprovacaoConferenciaSimples(companyId, competencia);
      if (!r.ok) setErro(r.erro);
    });
  }

  if (conferencia.motivos.length === 0) {
    return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${estilo}`}>{rotulo}</span>;
  }

  return (
    <div className="flex min-w-[220px] flex-col gap-1">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex items-center gap-2 text-left"
        aria-expanded={aberto}
      >
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${estilo}`}>{rotulo}</span>
        <span className="text-[11px] text-foreground/50 underline decoration-dotted">
          {conferencia.motivos.length === 1 ? "1 motivo" : `${conferencia.motivos.length} motivos`}
        </span>
      </button>

      {aberto && (
        <div className="flex max-w-[360px] flex-col gap-2 rounded border border-border bg-background p-2 text-xs whitespace-normal">
          <ul className="flex flex-col gap-1">
            {conferencia.motivos.map((m) => (
              <li key={m.codigo + m.texto} className={m.nivel === "BLOQUEADO" ? "text-danger" : "text-foreground/80"}>
                {m.nivel === "BLOQUEADO" ? "⛔ " : "• "}
                {m.texto}
              </li>
            ))}
          </ul>

          {aprovacao && (
            <p className="text-foreground/50">
              {aprovacaoVencida ? "Aprovação anterior perdeu a validade (os números mudaram). " : "Aprovada"}
              {aprovadaValida && (
                <>
                  {" "}
                  por {aprovacao.aprovadoPorNome ?? "—"} em{" "}
                  {new Date(aprovacao.aprovadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  {aprovacao.observacao ? ` — "${aprovacao.observacao}"` : ""}
                </>
              )}
            </p>
          )}

          {conferencia.status === "REVISAR" && !aprovadaValida && !aprovando && (
            <Button type="button" variant="secondary" onClick={() => setAprovando(true)}>
              Conferi — aprovar para envio
            </Button>
          )}

          {aprovando && (
            <div className="flex flex-col gap-2">
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="O que foi conferido (opcional)"
                rows={2}
                className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
              />
              <div className="flex gap-2">
                <Button type="button" loading={pendente} onClick={aprovar}>
                  Aprovar
                </Button>
                <Button type="button" variant="ghost" onClick={() => setAprovando(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {aprovadaValida && (
            <Button type="button" variant="ghost" loading={pendente} onClick={desfazer}>
              Desfazer aprovação
            </Button>
          )}

          {erro && <p className="text-danger">{erro}</p>}
        </div>
      )}
    </div>
  );
}
