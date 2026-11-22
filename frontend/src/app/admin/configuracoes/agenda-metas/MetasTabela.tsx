"use client";

import { useMemo, useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { salvarMetaAgendaAction } from "@/lib/actions/agenda-tributaria";
import { rotuloCurto } from "../../AgendaTributariaLista";

export type ObrigacaoMeta = {
  chave: string;
  tipo: "TRIBUTO" | "DECLARACAO";
  codigo: string | null;
  grupo: string | null;
  descricao: string;
  relevante: boolean;
  prazoReceita: string;
  diaFixo: boolean;
  diaMeta: number | null;
  observacao: string | null;
};

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function MetasTabela({ obrigacoes }: { obrigacoes: ObrigacaoMeta[] }) {
  const [todas, setTodas] = useState(false);
  const [busca, setBusca] = useState("");
  const comMeta = obrigacoes.filter((o) => o.diaMeta != null).length;

  const visiveis = useMemo(() => {
    const q = semAcento(busca.trim());
    return obrigacoes.filter((o) => {
      if (!todas && !o.relevante && o.diaMeta == null) return false;
      if (!q) return true;
      return semAcento([o.codigo, o.grupo, o.descricao].filter(Boolean).join(" ")).includes(q);
    });
  }, [obrigacoes, todas, busca]);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
        <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setTodas(false)}
            className={cn("rounded-md px-2.5 py-1", !todas ? "bg-brand text-brand-foreground" : "text-foreground/70")}
          >
            Relevantes SOMA
          </button>
          <button
            type="button"
            onClick={() => setTodas(true)}
            className={cn("rounded-md px-2.5 py-1", todas ? "bg-brand text-brand-foreground" : "text-foreground/70")}
          >
            Todas ({obrigacoes.length})
          </button>
        </div>
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar código ou tributo"
          className="h-8 w-60 rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
        />
        <span className="ml-auto text-xs text-foreground/60">
          {comMeta} {comMeta === 1 ? "obrigação com meta" : "obrigações com meta"}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-foreground/50">
              <th className="px-5 py-2 font-medium">Obrigação</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">Prazo Receita</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap">Meta SOMA (dia)</th>
              <th className="px-3 py-2 font-medium">Observação</th>
              <th className="px-5 py-2" />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((o) => (
              <LinhaMeta key={o.chave} o={o} />
            ))}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-foreground/60">
                  Nenhuma obrigação com esse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function LinhaMeta({ o }: { o: ObrigacaoMeta }) {
  const [dia, setDia] = useState(o.diaMeta?.toString() ?? "");
  const [obs, setObs] = useState(o.observacao ?? "");
  const [salvo, setSalvo] = useState({ dia: o.diaMeta?.toString() ?? "", obs: o.observacao ?? "" });
  const [status, setStatus] = useState<{ ok?: boolean; erro?: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const mudou = dia !== salvo.dia || obs !== salvo.obs;

  const salvar = () =>
    iniciar(async () => {
      const n = dia.trim() === "" ? null : Number(dia);
      const r = await salvarMetaAgendaAction({
        chave: o.chave,
        tipo: o.tipo,
        codigo: o.codigo,
        grupo: o.grupo,
        descricao: o.descricao,
        diaMeta: n,
        observacao: obs,
      });
      if ("error" in r) setStatus({ erro: r.error });
      else {
        setSalvo({ dia, obs: n == null ? "" : obs });
        if (n == null) setObs("");
        setStatus({ ok: true });
      }
    });

  return (
    <tr className={cn("border-b border-border/60 align-middle", salvo.dia && "bg-violet-50/60")}>
      <td className="min-w-[280px] px-5 py-2">
        <span
          className={cn(
            "rounded px-1.5 text-[11px] font-semibold leading-5",
            o.tipo === "TRIBUTO" ? "bg-brand-soft text-brand" : "bg-success-soft text-success",
          )}
        >
          {rotuloCurto(o)}
        </span>
        {o.codigo && <span className="ml-2 font-mono text-xs text-foreground">{o.codigo}</span>}
        <div className="mt-0.5 text-sm text-foreground/80">{o.descricao}</div>
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-xs text-foreground/60">{o.prazoReceita}</td>
      <td className="px-3 py-2">
        <input
          type="number"
          min={1}
          max={31}
          value={dia}
          disabled={!o.diaFixo}
          title={o.diaFixo ? undefined : "Obrigação sem dia fixo de vencimento"}
          onChange={(e) => setDia(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && mudou && salvar()}
          placeholder="—"
          className="h-8 w-16 rounded-lg border border-border bg-surface px-2 text-center text-sm text-foreground disabled:opacity-40"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="text"
          value={obs}
          disabled={!o.diaFixo || dia.trim() === ""}
          onChange={(e) => setObs(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && mudou && salvar()}
          placeholder="ex.: enviar guia ao cliente"
          className="h-8 w-full min-w-[160px] rounded-lg border border-border bg-surface px-2 text-sm text-foreground disabled:opacity-40"
        />
      </td>
      <td className="px-5 py-2 whitespace-nowrap text-right">
        {mudou ? (
          <button
            type="button"
            onClick={salvar}
            disabled={pendente}
            className="rounded-lg bg-brand px-3 py-1 text-xs font-medium text-brand-foreground disabled:opacity-50"
          >
            {pendente ? "Salvando…" : "Salvar"}
          </button>
        ) : status?.ok ? (
          <span className="text-xs text-success">Salvo</span>
        ) : null}
        {status?.erro && <div className="text-xs text-danger">{status.erro}</div>}
      </td>
    </tr>
  );
}
