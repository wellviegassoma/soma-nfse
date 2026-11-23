"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { formatarCpf, formatarMoeda } from "@/lib/formatters";
import { aplicarReajusteAction, salvarHonorarioAction } from "@/lib/actions/irpf";
import {
  FORMAS_PAGAMENTO,
  HONORARIO_LABEL,
  HONORARIO_STATUS,
  STATUS_LABEL,
  dataBr,
  valorReajustado,
  type HonorarioStatus,
  type StatusDeclaracao,
} from "@/lib/irpf/comum";

export type LinhaFinanceiro = {
  id: string;
  nome: string;
  cpf: string;
  responsavelId: string | null;
  responsavel: string;
  etapa: StatusDeclaracao;
  valor: number | null;
  situacao: HonorarioStatus;
  vencimento: string | null;
  pagoEm: string | null;
  forma: string | null;
  anterior: number | null;
};

type Filtro = "A_RECEBER" | "VENCIDOS" | "PAGOS" | "SEM_VALOR" | "TODOS";

const hojeIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const aReceber = (l: LinhaFinanceiro) => (l.situacao === "A_COBRAR" || l.situacao === "COBRADO") && (l.valor ?? 0) > 0;

function totais(ls: LinhaFinanceiro[], hoje: string) {
  const soma = (f: (l: LinhaFinanceiro) => boolean) => ls.filter(f).reduce((s, l) => s + (l.valor ?? 0), 0);
  return {
    n: ls.length,
    total: soma((l) => l.situacao !== "ISENTO"),
    recebido: soma((l) => l.situacao === "PAGO"),
    aReceber: soma(aReceber),
    vencido: soma((l) => aReceber(l) && !!l.vencimento && l.vencimento < hoje),
    semValor: ls.filter((l) => l.valor === null && l.situacao !== "ISENTO").length,
    isentos: ls.filter((l) => l.situacao === "ISENTO").length,
  };
}

export function FinanceiroIrpf({ exercicio, linhas: iniciais }: { exercicio: number; linhas: LinhaFinanceiro[] }) {
  const router = useRouter();
  const [linhas, setLinhas] = useState(iniciais);
  const [filtro, setFiltro] = useState<Filtro>("A_RECEBER");
  const [resp, setResp] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const hoje = hojeIso();

  const geral = totais(linhas, hoje);
  const grupos = new Map<string, LinhaFinanceiro[]>();
  for (const l of linhas) grupos.set(l.responsavel, [...(grupos.get(l.responsavel) ?? []), l]);
  const porResponsavel = [...grupos.entries()]
    .map(([nome, ls]) => ({ nome, ...totais(ls, hoje) }))
    .sort((a, b) => b.aReceber - a.aReceber);

  const visiveis = linhas
    .filter((l) => !resp || l.responsavel === resp)
    .filter((l) => {
      const q = busca.trim().toLowerCase();
      if (!q) return true;
      const d = q.replace(/\D/g, "");
      return l.nome.toLowerCase().includes(q) || (d.length >= 3 && l.cpf.includes(d));
    })
    .filter((l) =>
      filtro === "TODOS"
        ? true
        : filtro === "A_RECEBER"
          ? aReceber(l)
          : filtro === "VENCIDOS"
            ? aReceber(l) && !!l.vencimento && l.vencimento < hoje
            : filtro === "PAGOS"
              ? l.situacao === "PAGO"
              : l.valor === null && l.situacao !== "ISENTO",
    );

  const FILTROS: [Filtro, string, number][] = [
    ["A_RECEBER", "A receber", linhas.filter(aReceber).length],
    ["VENCIDOS", "Vencidos", linhas.filter((l) => aReceber(l) && !!l.vencimento && l.vencimento < hoje).length],
    ["PAGOS", "Pagos", linhas.filter((l) => l.situacao === "PAGO").length],
    ["SEM_VALOR", "Sem valor", geral.semValor],
    ["TODOS", "Todos", linhas.length],
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Total de honorários</div>
          <div className="mt-1 text-lg font-semibold">{formatarMoeda(geral.total)}</div>
          <div className="text-xs text-foreground/45">{geral.n} declarações · {geral.isentos} isenta(s)</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Recebido</div>
          <div className="mt-1 text-lg font-semibold text-success">{formatarMoeda(geral.recebido)}</div>
          <div className="text-xs text-foreground/45">
            {geral.total > 0 ? `${Math.round((geral.recebido / geral.total) * 100)}% do total` : "—"}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">A receber</div>
          <div className="mt-1 text-lg font-semibold text-warning">{formatarMoeda(geral.aReceber)}</div>
          <div className="text-xs text-danger">{geral.vencido > 0 ? `${formatarMoeda(geral.vencido)} vencido` : ""}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Sem honorário definido</div>
          <div className="mt-1 text-lg font-semibold">{geral.semValor}</div>
          <div className="text-xs text-foreground/45">declaração(ões)</div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">Por responsável</div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-foreground/50">
            <tr>
              <th className="px-5 py-2 font-medium">Responsável</th>
              <th className="px-3 py-2 text-right font-medium">Declarações</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2 text-right font-medium">Recebido</th>
              <th className="px-3 py-2 text-right font-medium">A receber</th>
              <th className="px-3 py-2 text-right font-medium">Vencido</th>
              <th className="px-5 py-2 text-right font-medium">Sem valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {porResponsavel.map((r) => (
              <tr
                key={r.nome}
                className={cn("cursor-pointer hover:bg-surface-muted", resp === r.nome && "bg-brand/5")}
                onClick={() => setResp(resp === r.nome ? "" : r.nome)}
                title="Clique para filtrar a lista abaixo"
              >
                <td className="px-5 py-2 font-medium">{r.nome}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.n}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(r.total)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-success">{formatarMoeda(r.recebido)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-warning">{formatarMoeda(r.aReceber)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-danger">{r.vencido ? formatarMoeda(r.vencido) : "—"}</td>
                <td className="px-5 py-2 text-right tabular-nums">{r.semValor || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Reajuste exercicio={exercicio} linhas={linhas} onAplicado={() => router.refresh()} />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
          {FILTROS.map(([f, rotulo, n]) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                filtro === f ? "border-brand bg-brand/10 text-brand" : "border-border text-foreground/60 hover:text-foreground",
              )}
            >
              {rotulo} ({n})
            </button>
          ))}
          {resp && (
            <button type="button" onClick={() => setResp("")} className="text-xs text-brand hover:underline">
              {resp} ✕
            </button>
          )}
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome ou CPF…" className="ml-auto h-9 w-56 text-sm" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-left text-xs text-foreground/55">
              <tr>
                <th className="px-5 py-2 font-medium">Contribuinte</th>
                <th className="px-3 py-2 font-medium">Responsável</th>
                <th className="px-3 py-2 text-right font-medium">{`Honorário ${exercicio - 1}`}</th>
                <th className="px-3 py-2 text-right font-medium">{`Honorário ${exercicio}`}</th>
                <th className="px-3 py-2 font-medium">Situação</th>
                <th className="px-3 py-2 font-medium">Vencimento</th>
                <th className="px-3 py-2 font-medium">Pago em</th>
                <th className="px-5 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visiveis.map((l) =>
                editando === l.id ? (
                  <LinhaEdicao
                    key={l.id}
                    linha={l}
                    onCancelar={() => setEditando(null)}
                    onSalvo={(nova) => {
                      setLinhas((ls) => ls.map((x) => (x.id === nova.id ? nova : x)));
                      setEditando(null);
                    }}
                  />
                ) : (
                  <tr key={l.id} className="hover:bg-surface-muted">
                    <td className="px-5 py-2">
                      <Link href={`/irpf/declaracoes/${l.id}`} className="font-medium hover:text-brand">
                        {l.nome}
                      </Link>
                      <div className="text-xs text-foreground/45">
                        CPF {formatarCpf(l.cpf)} · {STATUS_LABEL[l.etapa]}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-foreground/70">{l.responsavel}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground/50">{l.anterior !== null ? formatarMoeda(l.anterior) : "—"}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{l.valor !== null ? formatarMoeda(l.valor) : "—"}</td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          l.situacao === "PAGO"
                            ? "bg-success-soft text-success"
                            : l.situacao === "ISENTO"
                              ? "bg-surface-muted text-foreground/50"
                              : "bg-warning-soft text-warning",
                        )}
                      >
                        {HONORARIO_LABEL[l.situacao]}
                      </span>
                      {l.forma && <div className="text-[11px] text-foreground/45">{l.forma}</div>}
                    </td>
                    <td className={cn("px-3 py-2 text-xs", aReceber(l) && l.vencimento && l.vencimento < hoje && "font-semibold text-danger")}>
                      {l.vencimento ? dataBr(l.vencimento) : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">{l.pagoEm ? dataBr(l.pagoEm) : "—"}</td>
                    <td className="px-5 py-2 text-right">
                      <button type="button" className="text-xs text-brand hover:underline" onClick={() => setEditando(l.id)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ),
              )}
              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-6 text-center text-sm text-foreground/50">
                    Nada neste filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function LinhaEdicao({
  linha,
  onCancelar,
  onSalvo,
}: {
  linha: LinhaFinanceiro;
  onCancelar: () => void;
  onSalvo: (l: LinhaFinanceiro) => void;
}) {
  const [valor, setValor] = useState(linha.valor === null ? "" : String(linha.valor).replace(".", ","));
  const [situacao, setSituacao] = useState<HonorarioStatus>(linha.situacao);
  const [vencimento, setVencimento] = useState(linha.vencimento ?? "");
  const [pagoEm, setPagoEm] = useState(linha.pagoEm ?? "");
  const [forma, setForma] = useState(linha.forma ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const salvar = () => {
    const v = valor.trim() ? Number(valor.replace(/\./g, "").replace(",", ".")) : null;
    if (v !== null && !Number.isFinite(v)) return setMsg("Valor inválido.");
    start(async () => {
      const r = await salvarHonorarioAction({
        id: linha.id,
        valor: v,
        status: situacao,
        vencimento: vencimento || null,
        pagoEm: pagoEm || null,
        forma: forma || null,
      });
      if ("error" in r) setMsg(r.error);
      else
        onSalvo({ ...linha, valor: v, situacao, vencimento: vencimento || null, pagoEm: r.pagoEm, forma: forma || null });
    });
  };

  return (
    <tr className="bg-brand/5">
      <td className="px-5 py-2">
        <div className="font-medium">{linha.nome}</div>
        {msg && <div className="text-xs text-danger">{msg}</div>}
      </td>
      <td className="px-3 py-2 text-foreground/70">{linha.responsavel}</td>
      <td className="px-3 py-2 text-right text-foreground/50">{linha.anterior !== null ? formatarMoeda(linha.anterior) : "—"}</td>
      <td className="px-3 py-2">
        <Input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" className="h-9 w-28 text-right text-sm" />
      </td>
      <td className="px-3 py-2">
        <Select value={situacao} onChange={(e) => setSituacao(e.target.value as HonorarioStatus)} className="h-9 w-32 text-sm">
          {HONORARIO_STATUS.map((s) => (
            <option key={s} value={s}>
              {HONORARIO_LABEL[s]}
            </option>
          ))}
        </Select>
        <Select value={forma} onChange={(e) => setForma(e.target.value)} className="mt-1 h-9 w-32 text-sm">
          <option value="">Forma…</option>
          {FORMAS_PAGAMENTO.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Select>
      </td>
      <td className="px-3 py-2">
        <Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className="h-9 w-36 text-sm" />
      </td>
      <td className="px-3 py-2">
        <Input type="date" value={pagoEm} onChange={(e) => setPagoEm(e.target.value)} className="h-9 w-36 text-sm" />
      </td>
      <td className="px-5 py-2 text-right">
        <div className="flex flex-col items-end gap-1">
          <Button className="h-8 px-3" loading={pending} onClick={salvar}>
            Salvar
          </Button>
          <button type="button" className="text-xs text-foreground/50 hover:underline" onClick={onCancelar}>
            Cancelar
          </button>
        </div>
      </td>
    </tr>
  );
}

function Reajuste({ exercicio, linhas, onAplicado }: { exercicio: number; linhas: LinhaFinanceiro[]; onAplicado: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [percentual, setPercentual] = useState("10");
  const [arredondar, setArredondar] = useState("10");
  const [padrao, setPadrao] = useState("");
  const [sobrescrever, setSobrescrever] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const pct = Number(percentual.replace(",", "."));
  const arr = Number(arredondar);
  const vPadrao = padrao.trim() ? Number(padrao.replace(/\./g, "").replace(",", ".")) : null;
  const previa = useMemo(() => {
    let comBase = 0, comPadrao = 0, total = 0;
    for (const l of linhas) {
      if (!sobrescrever && l.valor !== null) continue;
      if (l.anterior !== null && Number.isFinite(pct)) {
        comBase++;
        total += valorReajustado(l.anterior, pct, arr);
      } else if (vPadrao !== null && Number.isFinite(vPadrao)) {
        comPadrao++;
        total += vPadrao;
      }
    }
    return { comBase, comPadrao, total };
  }, [linhas, pct, arr, vPadrao, sobrescrever]);

  if (!aberto) {
    return (
      <div>
        <Button variant="secondary" onClick={() => setAberto(true)}>
          Reajuste anual em lote
        </Button>
      </div>
    );
  }
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="text-sm font-semibold text-foreground/70">
        Reajuste: honorário {exercicio} = honorário {exercicio - 1} + percentual
      </div>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground/55">Percentual (%)</span>
          <Input value={percentual} onChange={(e) => setPercentual(e.target.value)} inputMode="decimal" className="h-9 w-24" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground/55">Arredondar para cima</span>
          <Select value={arredondar} onChange={(e) => setArredondar(e.target.value)} className="h-9 w-36 text-sm">
            <option value="0">Centavos</option>
            <option value="1">R$ 1</option>
            <option value="5">R$ 5</option>
            <option value="10">R$ 10</option>
            <option value="50">R$ 50</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground/55">Valor para quem não tem histórico (opcional)</span>
          <Input value={padrao} onChange={(e) => setPadrao(e.target.value)} inputMode="decimal" placeholder="ex.: 450,00" className="h-9 w-36" />
        </label>
        <label className="flex items-center gap-2 pb-2 text-xs text-foreground/60">
          <input type="checkbox" checked={sobrescrever} onChange={(e) => setSobrescrever(e.target.checked)} className="accent-brand" />
          Substituir também quem já tem valor
        </label>
      </div>
      <div className="text-sm text-foreground/70">
        Vai lançar <b>{previa.comBase}</b> honorário(s) pelo reajuste e <b>{previa.comPadrao}</b> pelo valor padrão — total{" "}
        <b>{formatarMoeda(previa.total)}</b>.
      </div>
      <div className="flex items-center gap-2">
        <Button
          loading={pending}
          disabled={previa.comBase + previa.comPadrao === 0 || !Number.isFinite(pct)}
          onClick={() =>
            start(async () => {
              const r = await aplicarReajusteAction({
                exercicio,
                percentual: pct,
                arredondar: arr,
                valorPadrao: vPadrao,
                sobrescrever,
              });
              if ("error" in r) setMsg(r.error);
              else {
                setMsg(`${r.alteradas} honorário(s) lançado(s).`);
                onAplicado();
              }
            })
          }
        >
          Aplicar
        </Button>
        <Button variant="ghost" onClick={() => setAberto(false)}>
          Fechar
        </Button>
        {msg && <span className="text-xs text-foreground/60">{msg}</span>}
      </div>
    </Card>
  );
}
