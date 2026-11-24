"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Input } from "@/components/ui/Input";
import { ETAPAS, STATUS_INFO } from "@/lib/extratos-status";
import type { EmpresaPainel } from "@/lib/extratos-painel";

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function quando(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(new Date(iso));
}

export function PainelEtapas({ empresas, competencia }: { empresas: EmpresaPainel[]; competencia: string }) {
  const [termo, setTermo] = useState("");
  const [fechadasAbertas, setFechadasAbertas] = useState(false);
  const filtradas = useMemo(() => {
    const t = normalizar(termo.trim());
    if (!t) return empresas;
    return empresas.filter((e) => normalizar(`${e.codigo ?? ""} ${e.nome}`).includes(t));
  }, [empresas, termo]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Filtrar por nome ou código..." className="h-10 w-full sm:w-72" />
        <div className="flex flex-wrap gap-3 text-xs text-foreground/60">
          {(["PENDENTE", "RECEBIDO", "CONFERIDO", "CONCILIADO", "SEM_MOVIMENTO"] as const).map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className={cn("h-2.5 w-2.5 rounded-full", STATUS_INFO[s].ponto)} />
              {STATUS_INFO[s].rotulo}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-foreground/20 ring-2 ring-danger" />
            com alerta
          </span>
        </div>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-2">
        <div className="grid min-w-[60rem] grid-cols-5 gap-3">
          {ETAPAS.map((etapa) => {
            const lista = filtradas.filter((e) => e.etapa === etapa.chave);
            const recolher = etapa.chave === "CONCILIADO" && !fechadasAbertas && lista.length > 6;
            return (
              <div key={etapa.chave} className="flex flex-col rounded-xl bg-surface-muted/60">
                <div className="flex items-baseline justify-between px-3 pb-1 pt-3">
                  <span className={cn("text-sm font-semibold", etapa.cor)}>{etapa.titulo}</span>
                  <span className="text-xs font-medium text-foreground/50">{lista.length}</span>
                </div>
                <div className="px-3 pb-2 text-[11px] text-foreground/45">{etapa.dica}</div>
                <div className="flex max-h-[34rem] flex-col gap-2 overflow-y-auto px-2 pb-2">
                  {(recolher ? lista.slice(0, 6) : lista).map((e) => (
                    <Link
                      key={e.id}
                      href={`/extratos/empresas/${e.id}?competencia=${competencia}`}
                      className={cn(
                        "rounded-lg border bg-surface px-3 py-2 shadow-sm transition-shadow hover:shadow-md",
                        e.avisos > 0 ? "border-danger/40" : "border-border",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 text-[13px] font-medium leading-tight text-foreground">
                          {e.codigo && <span className="mr-1 text-foreground/40">#{e.codigo}</span>}
                          {e.nome}
                        </div>
                        {e.avisos > 0 && (
                          <span className="shrink-0 rounded-full bg-danger/10 px-1.5 text-[11px] font-semibold text-danger" title="Alertas da IA">
                            ⚠ {e.avisos}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {e.semConta ? (
                          <span className="text-[11px] text-foreground/50">Sem conta cadastrada</span>
                        ) : (
                          e.contas.map((c) => (
                            <span
                              key={c.id}
                              title={`${c.banco} ${c.conta} — ${STATUS_INFO[c.status].rotulo}${c.avisos.length ? `\n⚠ ${c.avisos.join("\n⚠ ")}` : ""}`}
                              className={cn("h-3 w-3 rounded-full", STATUS_INFO[c.status].ponto, c.avisos.length > 0 && "ring-2 ring-danger")}
                            />
                          ))
                        )}
                        {e.cobradaEm && etapa.chave !== "CONCILIADO" && (
                          <span className="ml-auto text-[11px] text-foreground/45">cobrada {quando(e.cobradaEm)}</span>
                        )}
                      </div>
                    </Link>
                  ))}
                  {recolher && (
                    <button type="button" className="py-1 text-xs text-brand underline" onClick={() => setFechadasAbertas(true)}>
                      Ver as {lista.length - 6} restantes
                    </button>
                  )}
                  {lista.length === 0 && <div className="px-2 py-4 text-center text-xs text-foreground/35">—</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
