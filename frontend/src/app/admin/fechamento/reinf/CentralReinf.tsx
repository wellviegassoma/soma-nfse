"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { formatarCpfCnpj, formatarData } from "@/lib/formatters";
import { EVENTOS, NATUREZAS, type EventoReinf } from "@/lib/reinf-core";
import type { EmpresaReinf, NotaReinf, StatusReinf } from "@/lib/reinf";
import { ajustarNotaReinf, marcarReinf } from "@/lib/actions/reinf";
import { GuiasIssRetidoLote } from "./GuiasIssRetidoLote";

type Totais = {
  valores: Record<"irrf" | "pis" | "cofins" | "csll" | "cp" | "iss", number>;
  total: number;
  notas: number;
  valorServico: number;
  porEvento: Record<EventoReinf, { empresas: number; notas: number; total: number }>;
};

const moeda = (v: number) => (v ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—");
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const COR_EVENTO: Record<EventoReinf, string> = {
  "R-4020": "bg-brand/10 text-brand",
  "R-4010": "bg-violet-500/10 text-violet-600",
  "R-2010": "bg-warning-soft text-warning",
  ISS: "bg-surface-muted text-foreground/60",
};

const STATUS_LABEL: Record<StatusReinf, string> = {
  pendente: "Pendente",
  enviado: "Enviado",
  dispensado: "Dispensado",
};
const STATUS_COR: Record<StatusReinf, string> = {
  pendente: "border-warning/40 bg-warning-soft text-warning",
  enviado: "border-success/40 bg-success-soft text-success",
  dispensado: "border-border bg-surface-muted text-foreground/60",
};

function Selo({ e }: { e: EventoReinf }) {
  return (
    <span title={EVENTOS[e].descricao} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${COR_EVENTO[e]}`}>
      {EVENTOS[e].titulo}
    </span>
  );
}

const COLUNAS = [
  ["irrf", "IRRF"],
  ["pis", "PIS"],
  ["cofins", "COFINS"],
  ["csll", "CSLL"],
  ["cp", "INSS/CP"],
  ["iss", "ISS"],
] as const;

export function CentralReinf(props: {
  competencia: string;
  empresas: EmpresaReinf[];
  totais: Totais;
  podeMarcar: boolean;
}) {
  const { competencia, empresas, totais, podeMarcar } = props;
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<"empresas" | "notas">("empresas");
  const [filtroEvento, setFiltroEvento] = useState<EventoReinf | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<StatusReinf | null>(null);
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);

  const filtradas = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const bDig = b.replace(/\D/g, "");
    return empresas.filter((e) => {
      if (filtroEvento && !(filtroEvento === "ISS" ? e.temIss : e.eventos.includes(filtroEvento))) return false;
      if (filtroStatus && e.status !== filtroStatus) return false;
      if (!b) return true;
      return (
        e.nome.toLowerCase().includes(b) ||
        (bDig.length >= 3 && (e.cnpj ?? "").replace(/\D/g, "").includes(bDig)) ||
        e.notas.some(
          (n) =>
            (n.prestadorNome ?? "").toLowerCase().includes(b) ||
            n.numero === b ||
            (bDig.length >= 3 && (n.prestadorDocumento ?? "").includes(bDig)),
        )
      );
    });
  }, [empresas, filtroEvento, filtroStatus, busca]);

  const pendentes = empresas.filter((e) => e.status === "pendente").length;
  // Guia do ISS retido pelo sistema: só Petrópolis (débito ISRSN no portal).
  const comGuiaIss = (e: EmpresaReinf) => e.petropolis && e.valores.iss > 0;
  const empresasGuiaIss = filtradas
    .filter(comGuiaIss)
    .map((e) => ({ id: e.companyId, nome: e.nome, prefixoArquivo: e.prefixoArquivo }));

  function executar(acao: () => Promise<{ ok: true } | { ok: false; erro: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await acao();
      if (!r.ok) setErro(r.erro);
      else router.refresh();
    });
  }

  if (!empresas.length) {
    return (
      <Card className="p-6 text-sm text-foreground/60">
        Nenhuma nota recebida com retenção nesta competência. Se ainda não buscou as notas do mês, use “Buscar notas” no
        Fechamento.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {erro ? <Alert>{erro}</Alert> : null}

      {/* Registros da Reinf no mês */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(["R-4020", "R-4010", "R-2010", "ISS"] as EventoReinf[]).map((ev) => {
          const t = totais.porEvento[ev];
          const ativo = filtroEvento === ev;
          return (
            <button
              key={ev}
              type="button"
              onClick={() => setFiltroEvento(ativo ? null : ev)}
              className={`rounded-xl border bg-surface p-4 text-left transition ${ativo ? "border-brand ring-2 ring-brand/20" : "border-border hover:border-brand/40"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <Selo e={ev} />
                <span className="text-xs text-foreground/50">
                  {t.empresas} empresa(s) · {t.notas} nota(s)
                </span>
              </div>
              <div className="mt-2 text-lg font-semibold text-foreground">{reais(t.total)}</div>
              <div className="text-xs text-foreground/55">{EVENTOS[ev].descricao}</div>
            </button>
          );
        })}
      </div>

      {/* Totais por tributo */}
      <Card className="flex flex-wrap items-center gap-x-8 gap-y-3 p-5">
        <div>
          <div className="text-xs text-foreground/55">Total retido</div>
          <div className="text-lg font-semibold">{reais(totais.total)}</div>
          <div className="text-xs text-foreground/50">
            {totais.notas} nota(s) · {empresas.length} empresa(s) · serviços {reais(totais.valorServico)}
          </div>
        </div>
        {COLUNAS.map(([k, rotulo]) => (
          <div key={k}>
            <div className="text-xs text-foreground/55">{rotulo}</div>
            <div className="font-semibold">{reais(totais.valores[k])}</div>
          </div>
        ))}
        <div className="ml-auto text-right">
          <div className="text-xs text-foreground/55">Reinf pendente</div>
          <div className={`text-lg font-semibold ${pendentes ? "text-warning" : "text-success"}`}>
            {pendentes} empresa(s)
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <GuiasIssRetidoLote competencia={competencia} empresas={empresasGuiaIss} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex gap-1">
            {(
              [
                ["empresas", "Por empresa"],
                ["notas", "Nota a nota"],
              ] as const
            ).map(([k, r]) => (
              <button
                key={k}
                type="button"
                onClick={() => setAba(k)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${aba === k ? "bg-brand/10 text-brand" : "text-foreground/60 hover:text-foreground"}`}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["pendente", "enviado", "dispensado"] as StatusReinf[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFiltroStatus(filtroStatus === s ? null : s)}
                className={`rounded-full border px-3 py-1 text-xs ${filtroStatus === s ? STATUS_COR[s] : "border-border text-foreground/60"}`}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Empresa, prestador, CNPJ ou nº"
              className="h-9 w-56 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-brand"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {aba === "empresas" ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-foreground/50">
                  <th className="px-3 py-2 text-left">Empresa</th>
                  <th className="px-3 py-2 text-left">Registros</th>
                  <th className="px-3 py-2 text-right">Notas</th>
                  <th className="px-3 py-2 text-right">Valor serv.</th>
                  {COLUNAS.map(([k, r]) => (
                    <th key={k} className="px-3 py-2 text-right">
                      {r}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-center">ISS retido</th>
                  <th className="px-3 py-2 text-left">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtradas.map((e) => (
                  <Fragment key={e.companyId}>
                    <tr
                      className="cursor-pointer hover:bg-surface-muted/60"
                      onClick={() => setAberta(aberta === e.companyId ? null : e.companyId)}
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground">
                          <span className="mr-1 text-foreground/40">{aberta === e.companyId ? "▾" : "▸"}</span>
                          {e.nome}
                          {e.alertas ? (
                            <span className="ml-2 rounded bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium text-warning">
                              {e.alertas} alerta(s)
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-foreground/50">
                          {formatarCpfCnpj(e.cnpj)} · {e.regime === "SIMPLES_NACIONAL" ? "Simples" : e.regime === "LUCRO_PRESUMIDO" ? "Presumido" : (e.regime ?? "")}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {e.eventos.map((ev) => (
                            <Selo key={ev} e={ev} />
                          ))}
                          {e.temIss ? <Selo e="ISS" /> : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">{e.notas.filter((n) => !n.ignorar).length}</td>
                      <td className="px-3 py-2 text-right">{moeda(e.valorServico)}</td>
                      {COLUNAS.map(([k]) => (
                        <td key={k} className="px-3 py-2 text-right">
                          {moeda(e.valores[k])}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-semibold">{moeda(e.total)}</td>
                      <td className="px-3 py-2 text-center" onClick={(ev) => ev.stopPropagation()}>
                        {comGuiaIss(e) ? (
                          <a
                            href={`/admin/empresas/${e.companyId}/impostos/guia-iss-retido-petropolis?competencia=${competencia}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Baixa a guia do ISS retido (débito ISRSN) no portal de Petrópolis"
                            className="inline-flex items-center whitespace-nowrap rounded-md border border-border px-2 py-1 text-xs font-medium text-brand hover:bg-surface-muted"
                          >
                            Gerar guia
                          </a>
                        ) : e.valores.iss > 0 ? (
                          <span className="text-xs text-foreground/45" title="Guia pelo sistema só para Petrópolis">
                            fora de Petrópolis
                          </span>
                        ) : (
                          <span className="text-foreground/30">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2" onClick={(ev) => ev.stopPropagation()}>
                        {e.status ? (
                          <select
                            disabled={!podeMarcar || pendente}
                            value={e.status}
                            title={e.observacao ?? undefined}
                            onChange={(ev) => executar(() => marcarReinf(e.companyId, competencia, ev.target.value, e.observacao))}
                            className={`h-8 rounded-md border px-2 text-xs font-medium ${STATUS_COR[e.status]}`}
                          >
                            {(["pendente", "enviado", "dispensado"] as StatusReinf[]).map((s) => (
                              <option key={s} value={s}>
                                {STATUS_LABEL[s]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-foreground/45">só ISS</span>
                        )}
                      </td>
                    </tr>
                    {aberta === e.companyId ? (
                      <tr>
                        <td colSpan={13} className="bg-surface-muted/40 px-3 py-3">
                          <TabelaNotas notas={e.notas} competencia={competencia} podeMarcar={podeMarcar} executar={executar} ocupado={pendente} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-3">
              <TabelaNotas
                notas={filtradas.flatMap((e) => e.notas.map((n) => ({ ...n, empresaNome: e.nome })))}
                competencia={competencia}
                podeMarcar={podeMarcar}
                executar={executar}
                ocupado={pendente}
                comEmpresa
              />
            </div>
          )}
        </div>
      </Card>

      <p className="text-xs text-foreground/50">
        Valores lidos do XML de cada nota. Desde a NT 007/2026 a nota informa PIS + COFINS + CSLL retidos somados; aqui eles
        são separados pelas alíquotas (0,65% / 3% / 1%), como a Reinf exige. R-4010/R-4020 vão no mês do pagamento: sem
        ajuste, vale a competência da nota. ISS retido é municipal e não entra na Reinf.
      </p>
    </div>
  );
}

function TabelaNotas(props: {
  notas: (NotaReinf & { empresaNome?: string })[];
  competencia: string;
  podeMarcar: boolean;
  ocupado: boolean;
  comEmpresa?: boolean;
  executar: (acao: () => Promise<{ ok: true } | { ok: false; erro: string }>) => void;
}) {
  const { notas, competencia, podeMarcar, ocupado, comEmpresa, executar } = props;
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-foreground/50">
          {comEmpresa ? <th className="px-2 py-1.5 text-left">Empresa</th> : null}
          <th className="px-2 py-1.5 text-left">Emissão</th>
          <th className="px-2 py-1.5 text-left">Nº</th>
          <th className="px-2 py-1.5 text-left">Prestador</th>
          <th className="px-2 py-1.5 text-right">Valor serv.</th>
          {COLUNAS.map(([k, r]) => (
            <th key={k} className="px-2 py-1.5 text-right">
              {r}
            </th>
          ))}
          <th className="px-2 py-1.5 text-left">Registro</th>
          <th className="px-2 py-1.5 text-left">Natureza</th>
          <th className="px-2 py-1.5 text-left">Pago em</th>
          <th className="px-2 py-1.5 text-center">Ignorar</th>
          <th className="px-2 py-1.5 text-center">PDF</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/70">
        {notas.map((n) => {
          const r4000 = n.eventos.includes("R-4020") || n.eventos.includes("R-4010");
          return (
            <Fragment key={n.id}>
              <tr className={n.ignorar ? "opacity-45" : ""}>
                {comEmpresa ? <td className="max-w-[180px] truncate px-2 py-1.5">{n.empresaNome}</td> : null}
                <td className="whitespace-nowrap px-2 py-1.5">{formatarData(n.dataEmissao)}</td>
                <td className="px-2 py-1.5">{n.numero}</td>
                <td className="max-w-[220px] px-2 py-1.5">
                  <div className="truncate" title={n.prestadorNome ?? ""}>
                    {n.prestadorNome}
                  </div>
                  <div className="text-foreground/45">{formatarCpfCnpj(n.prestadorDocumento)}</div>
                </td>
                <td className="px-2 py-1.5 text-right">{moeda(n.valorServico)}</td>
                {COLUNAS.map(([k]) => (
                  <td key={k} className="px-2 py-1.5 text-right">
                    {moeda(n.valores[k])}
                  </td>
                ))}
                <td className="px-2 py-1.5">
                  <div className="flex flex-wrap gap-1">
                    {n.eventos.map((ev) => (
                      <Selo key={ev} e={ev} />
                    ))}
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  {r4000 && n.natureza ? (
                    <select
                      disabled={!podeMarcar || ocupado}
                      value={n.natureza}
                      title={`${NATUREZAS[n.natureza] ?? ""}${n.natureza === n.naturezaSugerida ? " (sugerida pelo código de serviço)" : ""}`}
                      onChange={(e) =>
                        executar(() =>
                          ajustarNotaReinf(n.id, { natureza: e.target.value === n.naturezaSugerida ? null : e.target.value }),
                        )
                      }
                      className="h-7 max-w-[150px] rounded border border-border bg-surface px-1 text-xs"
                    >
                      {Object.entries(NATUREZAS).map(([cod, desc]) => (
                        <option key={cod} value={cod}>
                          {cod} · {desc}
                          {cod === n.naturezaSugerida ? " ★" : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-foreground/40">—</span>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  {r4000 ? (
                    <input
                      type="month"
                      disabled={!podeMarcar || ocupado}
                      defaultValue={n.mesPagamento ?? n.competencia}
                      title="Mês do pagamento (R-4010/R-4020). Sem ajuste, vale a competência da nota."
                      onBlur={(e) => {
                        const v = e.target.value || null;
                        const novo = v === n.competencia ? null : v;
                        if (novo !== n.mesPagamento) executar(() => ajustarNotaReinf(n.id, { mesPagamento: novo }));
                      }}
                      className={`h-7 rounded border bg-surface px-1 text-xs ${n.mesPagamento && n.mesPagamento !== competencia ? "border-warning" : "border-border"}`}
                    />
                  ) : null}
                </td>
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="checkbox"
                    disabled={!podeMarcar || ocupado}
                    checked={n.ignorar}
                    title="Retenção informada por engano: não entra nos totais"
                    onChange={(e) => executar(() => ajustarNotaReinf(n.id, { ignorar: e.target.checked }))}
                  />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <a
                    href={`/admin/empresas/${n.companyId}/fechamento/notas/${n.id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded border border-border px-2 py-1 font-medium text-brand hover:bg-surface-muted"
                    title="Abrir o PDF da nota numa nova aba"
                  >
                    PDF
                  </a>
                </td>
              </tr>
              {n.alertas.length || n.parcialNoMes || (n.mesPagamento && n.competencia !== competencia) ? (
                <tr>
                  <td colSpan={comEmpresa ? 16 : 15} className="px-2 pb-2 text-[11px] text-warning">
                    {n.mesPagamento && n.competencia !== competencia ? `Nota de ${n.competencia.split("-").reverse().join("/")}, paga neste mês. ` : ""}
                    {n.parcialNoMes ? "Parte da retenção foi para outro mês (pagamento ou competência diferentes). " : ""}
                    {n.alertas.join(" ")}
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
