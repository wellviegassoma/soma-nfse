"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { marcarStatusReforma } from "@/lib/actions/reforma-tributaria";
import { NOME_REGIME, type RegimeSimulado } from "@/lib/reforma-tributaria/motor";
import { ROTULO_STATUS, opcoesMudanca, type StatusAnalise } from "@/lib/reforma-tributaria/analise";

// Seletores da coluna "Análise" da carteira: status e, quando há mudança,
// para qual regime. Salva na hora e recarrega a lista (a linha muda de cor e
// vai para o fim da fila).
export function StatusAnaliseSelect({
  companyId,
  status,
  mudancaPara,
  regimeAtual,
  sugestao,
}: {
  companyId: string;
  status: StatusAnalise;
  mudancaPara: RegimeSimulado | null;
  regimeAtual: RegimeSimulado | null;
  // Melhor opção da simulação, se diferente do regime atual — pré-seleciona a mudança.
  sugestao: RegimeSimulado | null;
}) {
  const router = useRouter();
  const [valor, setValor] = useState(status);
  const [mudanca, setMudanca] = useState<RegimeSimulado | null>(mudancaPara);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function gravar(novoStatus: StatusAnalise, novaMudanca: RegimeSimulado | null | undefined) {
    const anterior = { valor, mudanca };
    setErro(null);
    iniciar(async () => {
      const r = await marcarStatusReforma(companyId, novoStatus, novaMudanca);
      if (r?.error) {
        setValor(anterior.valor);
        setMudanca(anterior.mudanca);
        setErro(r.error);
      } else router.refresh();
    });
  }

  return (
    <div className="flex min-w-[210px] flex-col gap-1.5">
      <select
        aria-label="Status da análise"
        value={valor}
        disabled={pendente}
        onChange={(ev) => {
          const novo = ev.target.value as StatusAnalise;
          setValor(novo);
          // Ao marcar "com mudança" sem mudança escolhida, já sugere a da simulação.
          const novaMudanca = novo === "COM_MUDANCA" ? (mudanca ?? sugestao) : null;
          setMudanca(novaMudanca);
          gravar(novo, novaMudanca);
        }}
        className={cn(
          "h-9 w-full rounded-lg border bg-surface px-2 text-xs font-medium outline-none focus:ring-2 focus:ring-brand/20",
          valor === "SEM_MUDANCA" && "border-success/50 text-success",
          valor === "COM_MUDANCA" && "border-yellow-500 text-yellow-800",
          valor === "PENDENTE" && "border-border text-foreground/70",
        )}
      >
        {(Object.keys(ROTULO_STATUS) as StatusAnalise[]).map((s) => (
          <option key={s} value={s}>
            {ROTULO_STATUS[s]}
          </option>
        ))}
      </select>
      {valor === "COM_MUDANCA" && (
        <select
          aria-label="Mudar para"
          value={mudanca ?? ""}
          disabled={pendente}
          onChange={(ev) => {
            const nova = (ev.target.value || null) as RegimeSimulado | null;
            setMudanca(nova);
            gravar("COM_MUDANCA", nova);
          }}
          className="h-9 w-full rounded-lg border border-yellow-500 bg-surface px-2 text-xs font-semibold text-yellow-900 outline-none focus:ring-2 focus:ring-yellow-400/40"
        >
          <option value="">Mudar para: a definir</option>
          {opcoesMudanca(regimeAtual).map((r) => (
            <option key={r} value={r}>
              Mudar para: {NOME_REGIME[r]}
            </option>
          ))}
        </select>
      )}
      {erro && <div className="max-w-[220px] text-xs text-danger">{erro}</div>}
    </div>
  );
}
