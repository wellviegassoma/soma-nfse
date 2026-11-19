"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { marcarStatusReforma } from "@/lib/actions/reforma-tributaria";
import { ROTULO_STATUS, type StatusAnalise } from "@/lib/reforma-tributaria/analise";

// Seletor da coluna "Análise" da carteira: salva na hora e recarrega a lista
// (a linha muda de cor e vai para o fim da fila).
export function StatusAnaliseSelect({ companyId, status }: { companyId: string; status: StatusAnalise }) {
  const router = useRouter();
  const [valor, setValor] = useState(status);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="min-w-[210px]">
      <select
        aria-label="Status da análise"
        value={valor}
        disabled={pendente}
        onChange={(ev) => {
          const novo = ev.target.value as StatusAnalise;
          const anterior = valor;
          setValor(novo);
          setErro(null);
          iniciar(async () => {
            const r = await marcarStatusReforma(companyId, novo);
            if (r?.error) {
              setValor(anterior);
              setErro(r.error);
            } else router.refresh();
          });
        }}
        className={cn(
          "h-9 w-full rounded-lg border bg-surface px-2 text-xs font-medium outline-none focus:ring-2 focus:ring-brand/20",
          valor === "SEM_MUDANCA" && "border-success/50 text-success",
          valor === "COM_MUDANCA" && "border-warning/50 text-warning",
          valor === "PENDENTE" && "border-border text-foreground/70",
        )}
      >
        {(Object.keys(ROTULO_STATUS) as StatusAnalise[]).map((s) => (
          <option key={s} value={s}>
            {ROTULO_STATUS[s]}
          </option>
        ))}
      </select>
      {erro && <div className="mt-1 max-w-[220px] text-xs text-danger">{erro}</div>}
    </div>
  );
}
