"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { salvarReguaExtratos } from "@/lib/actions/extratos-cobranca";

export function ReguaCard({
  inicial,
  podeEditar,
  previa,
}: {
  inicial: { ativa: boolean; diaCobranca: number; diaLembrete: number; alteradoPor: string | null; alteradoEm: string | null };
  podeEditar: boolean;
  previa: { tipo: string | null; quantidade: number; motivo: string | null };
}) {
  const [ativa, setAtiva] = useState(inicial.ativa);
  const [diaCobranca, setDiaCobranca] = useState(inicial.diaCobranca);
  const [diaLembrete, setDiaLembrete] = useState(inicial.diaLembrete);
  const [msg, setMsg] = useState<string | null>(null);
  const [salvando, start] = useTransition();
  const mudou = ativa !== inicial.ativa || diaCobranca !== inicial.diaCobranca || diaLembrete !== inicial.diaLembrete;

  function salvar() {
    if (ativa && !inicial.ativa && !confirm("Ligar a régua? A partir do próximo dia útil configurado, as mensagens saem sozinhas para os grupos dos clientes com extrato pendente.")) return;
    setMsg(null);
    start(async () => {
      const r = await salvarReguaExtratos({ ativa, diaCobranca, diaLembrete });
      setMsg(r.error ?? "Salvo.");
    });
  }

  return (
    <div className={cn("rounded-xl border p-4", inicial.ativa ? "border-success/40 bg-success/5" : "border-border bg-surface")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">
            Régua automática {inicial.ativa ? <span className="text-success">· ligada</span> : <span className="text-foreground/50">· desligada</span>}
          </div>
          <p className="mt-0.5 max-w-2xl text-xs text-foreground/60">
            Nos dias úteis, às 9h: a partir do dia {diaCobranca}, cobra o mês anterior de quem ainda não mandou; a partir do dia {diaLembrete}, manda
            lembrete só do que falta. Nunca repete o mesmo tipo no mês nem cobra quem já foi cobrado nos últimos 3 dias.
          </p>
          <p className="mt-1 text-xs text-foreground/50">
            {previa.tipo
              ? `Se rodasse hoje: ${previa.quantidade} empresa(s) receberiam ${previa.tipo === "AUTO_LEMBRETE" ? "o lembrete" : "a cobrança"}.`
              : `Hoje não roda (${previa.motivo}).`}
            {inicial.alteradoPor && ` · Alterada por ${inicial.alteradoPor}`}
          </p>
        </div>
        {podeEditar && (
          <div className="flex flex-wrap items-end gap-3 text-xs text-foreground/60">
            <label className="flex h-9 items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} />
              Ligada
            </label>
            <label className="flex flex-col gap-1">
              Cobrança a partir do dia
              <input type="number" min={1} max={28} value={diaCobranca} onChange={(e) => setDiaCobranca(Number(e.target.value))} className="h-9 w-20 rounded-lg border border-border bg-surface px-2 text-sm" />
            </label>
            <label className="flex flex-col gap-1">
              Lembrete a partir do dia
              <input type="number" min={1} max={28} value={diaLembrete} onChange={(e) => setDiaLembrete(Number(e.target.value))} className="h-9 w-20 rounded-lg border border-border bg-surface px-2 text-sm" />
            </label>
            <Button variant="secondary" className="h-9" disabled={!mudou} loading={salvando} onClick={salvar}>
              Salvar
            </Button>
          </div>
        )}
      </div>
      {msg && <div className="mt-2 text-xs text-foreground/70">{msg}</div>}
    </div>
  );
}
