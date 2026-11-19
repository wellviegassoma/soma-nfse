"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import {
  descartarAnaliseReforma,
  salvarAnaliseReforma,
  type SalvarAnaliseInput,
} from "@/lib/actions/reforma-tributaria";
import { NOME_REGIME, type RegimeSimulado } from "@/lib/reforma-tributaria/motor";
import {
  ROTULO_STATUS,
  opcoesMudanca,
  type AnaliseReforma,
  type StatusAnalise,
} from "@/lib/reforma-tributaria/analise";
import type { AnoSimulacao } from "@/lib/reforma-tributaria/parametros";

export type DadosAnalise = Pick<
  SalvarAnaliseInput,
  "entrada" | "temLivroCaixa" | "livroCaixaMediaMensal" | "livroCaixaMeses"
>;

/**
 * "Minha análise" do simulador — usado pela PJ e pela pessoa física.
 * `montarDados` devolve o que foi editado na tela (o que vai para
 * reforma_analises.entrada e o livro caixa).
 */
export function PainelAnalise({
  companyId,
  analise,
  regimeAtual,
  ano,
  sugestao,
  mudancaSugerida,
  rotuloMelhor,
  montarDados,
}: {
  companyId: string;
  analise: AnaliseReforma | null;
  regimeAtual: RegimeSimulado | null;
  ano: AnoSimulacao;
  // Status que a simulação do ano sugere e a mudança correspondente.
  sugestao: StatusAnalise | null;
  mudancaSugerida: RegimeSimulado | null;
  rotuloMelhor: string | null;
  montarDados: () => DadosAnalise;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [status, setStatus] = useState<StatusAnalise>(analise?.status ?? "PENDENTE");
  const [observacao, setObservacao] = useState(analise?.observacao ?? "");
  // Sem mudança gravada, já vem marcada a sugerida pela simulação.
  const [mudancaPara, setMudancaPara] = useState<RegimeSimulado | null>(
    () => analise?.mudancaPara ?? mudancaSugerida,
  );
  const opcoes = opcoesMudanca(regimeAtual);

  function salvar() {
    setMsg(null);
    iniciar(async () => {
      const r = await salvarAnaliseReforma({
        companyId,
        status,
        observacao: observacao.trim() || null,
        ...montarDados(),
        mudancaPara: status === "COM_MUDANCA" ? mudancaPara : null,
        anoReferencia: ano,
      });
      setMsg(r ?? null);
      if (r?.ok) router.refresh();
    });
  }

  return (
    <Card
      className={cn(
        "p-6",
        status === "SEM_MUDANCA" && "border-success/40 bg-success-soft",
        status === "COM_MUDANCA" && "border-yellow-400 bg-yellow-100",
      )}
    >
      <h2 className="text-sm font-semibold text-foreground">Minha análise</h2>
      <p className="mt-1 text-xs text-foreground/55">
        Salvar guarda os dados editados acima, o livro caixa e o status. A carteira passa a usar estes dados no lugar
        dos do sistema para este cliente.
        {analise?.analisadoEm
          ? ` Última análise: ${new Date(analise.analisadoEm).toLocaleString("pt-BR")}${analise.analisadoPor ? ` por ${analise.analisadoPor}` : ""}.`
          : ""}
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-[300px_1fr]">
        <div className="flex flex-col gap-4">
          <Field
            label="Status"
            htmlFor="status"
            hint={sugestao ? `Pela simulação de ${ano}: ${ROTULO_STATUS[sugestao].toLowerCase()}` : undefined}
          >
            <Select
              id="status"
              value={status}
              onChange={(ev) => {
                const novo = ev.target.value as StatusAnalise;
                setStatus(novo);
                // Ao marcar "com mudança" sem nada escolhido, usa a sugestão atual da simulação.
                if (novo === "COM_MUDANCA" && !mudancaPara) setMudancaPara(mudancaSugerida);
              }}
            >
              {(Object.keys(ROTULO_STATUS) as StatusAnalise[]).map((s) => (
                <option key={s} value={s}>
                  {ROTULO_STATUS[s]}
                </option>
              ))}
            </Select>
          </Field>
          {status === "COM_MUDANCA" && (
            <Field
              label={regimeAtual ? "Mudar para" : "Abrir PJ no"}
              htmlFor="mudanca"
              hint={rotuloMelhor ? `Melhor opção na simulação de ${ano}: ${rotuloMelhor}` : undefined}
            >
              <Select
                id="mudanca"
                value={mudancaPara ?? ""}
                onChange={(ev) => setMudancaPara((ev.target.value || null) as RegimeSimulado | null)}
              >
                <option value="">A definir</option>
                {opcoes.map((r) => (
                  <option key={r} value={r}>
                    {NOME_REGIME[r]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <Field label="Observações" htmlFor="obs">
          <textarea
            id="obs"
            rows={3}
            value={observacao}
            onChange={(ev) => setObservacao(ev.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3.5 py-2 text-[15px] text-foreground outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
            placeholder="Ex.: migrar para o Simples em jan/2027; reunião marcada com o sócio"
          />
        </Field>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button type="button" onClick={salvar} disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar análise"}
        </Button>
        {analise && (
          <button
            type="button"
            disabled={pendente}
            onClick={() => {
              if (!confirm("Descartar a análise salva? O cliente volta a usar só os dados do sistema.")) return;
              setMsg(null);
              iniciar(async () => {
                const r = await descartarAnaliseReforma(companyId);
                setMsg(r ?? null);
                // Recarrega a página inteira: o estado do formulário volta aos dados do sistema.
                if (r?.ok) window.location.reload();
              });
            }}
            className="text-sm font-medium text-danger hover:underline disabled:opacity-50"
          >
            Descartar análise salva
          </button>
        )}
        {msg?.ok && <span className="text-sm font-medium text-success">{msg.ok}</span>}
        {msg?.error && <span className="text-sm font-medium text-danger">{msg.error}</span>}
      </div>
    </Card>
  );
}
