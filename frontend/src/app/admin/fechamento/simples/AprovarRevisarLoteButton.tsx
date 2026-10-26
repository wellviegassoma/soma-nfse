"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { aprovarConferenciaSimplesLote, type ResultadoAprovacaoLote } from "@/lib/actions/conferencia-simples";
import type { MotivoConferencia } from "@/lib/simples-conferencia";

type Empresa = { id: string; nome: string; assinatura: string; motivos: MotivoConferencia[] };

const ROTULO_MOTIVO: Record<string, string> = {
  SEM_RECEITA: "sem receita no mês",
  RBT12_ESTIMADO: "RBT12 estimado",
  FOLHA_INCOMPLETA: "folha incompleta",
  FATOR_R_BORDA: "Fator R perto de 28%",
  ANEXO_V: "Anexo V (Fator R abaixo de 28%)",
  VARIACAO_ALTA: "receita muito acima da média",
  VARIACAO_BAIXA: "receita muito abaixo da média",
  PREFEITURA_NAO_CONFERIDA: "Prefeitura não conferida",
  PREFEITURA_SEM_ACESSO: "Prefeitura sem acesso",
  PREFEITURA_DIVERGENTE: "divergente da Prefeitura",
  RETENCAO_ZEROU_DAS: "retenção zerou o DAS",
  SUBLIMITE_PERTO: "perto do sublimite",
};

// Aprova de uma vez as empresas em "Revisar" marcadas na tabela — útil
// pros casos repetitivos (sem movimento no mês, por exemplo). Antes de
// confirmar mostra quantas empresas há de cada motivo, pra quem aprova
// saber o que está aprovando. O servidor recalcula cada empresa e recusa
// a que tiver mudado desde que a tela foi aberta.
export function AprovarRevisarLoteButton({
  competencia,
  empresas,
}: {
  competencia: string;
  empresas: Empresa[];
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [observacao, setObservacao] = useState("");
  const [resultado, setResultado] = useState<ResultadoAprovacaoLote | null>(null);
  const [pendente, startTransition] = useTransition();

  const porMotivo = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const e of empresas) {
      for (const codigo of new Set(e.motivos.map((m) => m.codigo))) {
        contagem.set(codigo, (contagem.get(codigo) ?? 0) + 1);
      }
    }
    return [...contagem.entries()].sort((a, b) => b[1] - a[1]);
  }, [empresas]);

  const nomePorId = useMemo(() => new Map(empresas.map((e) => [e.id, e.nome])), [empresas]);

  function aprovar() {
    setResultado(null);
    startTransition(async () => {
      const r = await aprovarConferenciaSimplesLote(
        competencia,
        empresas.map((e) => ({ companyId: e.id, assinatura: e.assinatura })),
        observacao,
      );
      setResultado(r);
      setConfirmando(false);
      setObservacao("");
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {!confirmando && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => setConfirmando(true)}
          disabled={empresas.length === 0}
          loading={pendente}
        >
          Aprovar revisão das selecionadas ({empresas.length})
        </Button>
      )}

      {confirmando && (
        <Alert tone="warning">
          <div className="flex max-w-[520px] flex-col gap-3">
            <span>
              Aprovar <strong>{empresas.length} empresa(s)</strong> em revisão para entrar no envio de {competencia}.
              Motivos em aberto:
            </span>
            <ul className="list-disc pl-5 text-xs">
              {porMotivo.map(([codigo, qtd]) => (
                <li key={codigo}>
                  {ROTULO_MOTIVO[codigo] ?? codigo}: {qtd}
                </li>
              ))}
            </ul>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="O que foi conferido (vale para todas)"
              rows={2}
              className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
            />
            <div className="flex gap-2">
              <Button type="button" loading={pendente} onClick={aprovar}>
                Aprovar {empresas.length}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirmando(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </Alert>
      )}

      {resultado && (
        <Alert tone={resultado.erroGeral || resultado.recusadas.length > 0 ? "warning" : "success"}>
          {resultado.erroGeral ?? `${resultado.aprovadas} empresa(s) aprovada(s).`}
          {resultado.recusadas.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {resultado.recusadas.map((r) => (
                <li key={r.companyId}>
                  <strong>{nomePorId.get(r.companyId) ?? r.companyId}</strong> — {r.erro}
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}
    </div>
  );
}
