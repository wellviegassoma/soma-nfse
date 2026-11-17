"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { PagamentoFederal } from "@/lib/pagamentos-federais-core";

// Pagamentos federais pelo Integra Contador (PAGTOWEB) — 17/11/2026.
// "DAS pago?" na Central Simples + lista de pagamentos na aba Impostos.
// Cada consulta é cobrada (uma por empresa; o serviço guarda o resultado do
// dia) e cada comprovante também (só quando alguém clica; guardado 180 dias).

export type DasPagamentoView = {
  status: "pago" | "nao_pago" | "erro";
  pagamentos: PagamentoFederal[];
  mensagem: string | null;
  verificadoEm: string;
};

const EVENTO = "das-pagamento-verificado";
type Detalhe = { companyId: string; das: DasPagamentoView | null; erro?: string };

async function consultar(companyId: string, competencia: string) {
  try {
    const r = await fetch(`/admin/empresas/${companyId}/integra-contador/pagamentos?competencia=${competencia}`);
    const corpo = await r.json().catch(() => null);
    if (!r.ok) return { ok: false as const, erro: (corpo?.error as string) ?? `Erro ${r.status}` };
    return {
      ok: true as const,
      pagamentos: (corpo.pagamentos ?? []) as PagamentoFederal[],
      paginaCheia: Boolean(corpo.paginaCheia),
      das: corpo.das as DasPagamentoView,
    };
  } catch {
    return { ok: false as const, erro: "Sem resposta do servidor." };
  }
}

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "");

/** Vencimento do DAS: dia 20 do mês seguinte à competência. */
function vencimentoDas(competencia: string): string {
  const [a, m] = competencia.split("-").map(Number);
  return new Date(Date.UTC(a, m, 20)).toISOString().slice(0, 10);
}

function linkComprovante(companyId: string, numero: string) {
  return `/admin/empresas/${companyId}/integra-contador/pagamentos/comprovante/${encodeURIComponent(numero)}`;
}

export function DasPagoCelula({
  companyId,
  competencia,
  inicial,
}: {
  companyId: string;
  competencia: string;
  inicial: DasPagamentoView | null;
}) {
  const [das, setDas] = useState<DasPagamentoView | null>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);

  useEffect(() => {
    function aoVerificar(ev: Event) {
      const d = (ev as CustomEvent<Detalhe>).detail;
      if (d.companyId !== companyId) return;
      if (d.das) setDas(d.das);
      setErro(d.erro ?? null);
    }
    window.addEventListener(EVENTO, aoVerificar);
    return () => window.removeEventListener(EVENTO, aoVerificar);
  }, [companyId]);

  async function verificar() {
    setVerificando(true);
    const r = await consultar(companyId, competencia);
    if (r.ok) {
      setDas(r.das);
      setErro(null);
    } else setErro(r.erro);
    setVerificando(false);
  }

  const vencido = das?.status === "nao_pago" && vencimentoDas(competencia) < (das.verificadoEm ?? "").slice(0, 10);
  const total = das?.pagamentos.reduce((a, p) => a + p.valorTotal, 0) ?? 0;
  const pagoEm = das?.pagamentos.map((p) => p.dataArrecadacao).find(Boolean) ?? null;

  return (
    <div className="flex flex-col items-start gap-1">
      {das?.status === "pago" ? (
        <div>
          <span className="rounded bg-success-soft px-1.5 py-0.5 text-[11px] font-semibold text-success">Pago</span>
          <div className="mt-0.5 text-[11px] text-foreground/60">
            {pagoEm ? `em ${dataBr(pagoEm)} · ` : ""}
            {moeda(total)}
          </div>
          {das.pagamentos.map((p) => (
            <a
              key={p.numeroDocumento}
              href={linkComprovante(companyId, p.numeroDocumento)}
              target="_blank"
              rel="noreferrer"
              title="Emite o comprovante na Receita (cobrado na primeira vez; depois fica guardado)"
              className="block text-[11px] text-brand hover:underline"
            >
              Comprovante
            </a>
          ))}
        </div>
      ) : das?.status === "nao_pago" ? (
        <span
          className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${vencido ? "bg-danger/10 text-danger" : "bg-warning-soft text-warning"}`}
        >
          {vencido ? "Não pago — vencido" : "Não pago"}
        </span>
      ) : (
        <span className="text-[11px] text-foreground/40">não verificado</span>
      )}
      {erro && <p className="max-w-[200px] text-[10px] text-danger">{erro}</p>}
      <button
        type="button"
        disabled={verificando}
        onClick={verificar}
        title={das ? `Última verificação: ${new Date(das.verificadoEm).toLocaleString("pt-BR")}` : undefined}
        className="text-[11px] font-medium text-brand hover:underline disabled:opacity-50"
      >
        {verificando ? "Verificando…" : das ? "Verificar de novo" : "Verificar pagamento"}
      </button>
    </div>
  );
}

export function VerificarDasLote({
  competencia,
  empresas,
}: {
  competencia: string;
  empresas: { id: string; nome: string }[];
}) {
  const [rodando, setRodando] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [resumo, setResumo] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  async function rodar() {
    setConfirmando(false);
    setRodando(true);
    setResumo(null);
    let pagos = 0,
      naoPagos = 0,
      erros = 0;
    for (let i = 0; i < empresas.length; i++) {
      setProgresso(`${i + 1}/${empresas.length} — ${empresas[i].nome}`);
      const r = await consultar(empresas[i].id, competencia);
      const detalhe: Detalhe = r.ok ? { companyId: empresas[i].id, das: r.das } : { companyId: empresas[i].id, das: null, erro: r.erro };
      window.dispatchEvent(new CustomEvent<Detalhe>(EVENTO, { detail: detalhe }));
      if (!r.ok) erros++;
      else if (r.das.status === "pago") pagos++;
      else naoPagos++;
    }
    setResumo(`${pagos} pago(s) · ${naoPagos} não pago(s)${erros ? ` · ${erros} com erro` : ""}`);
    setProgresso(null);
    setRodando(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {confirmando ? (
        <span className="flex flex-wrap items-center gap-2 text-xs">
          Vai consultar o Integra Contador para {empresas.length} empresa(s) — cada consulta é cobrada (repetir no mesmo
          dia não cobra de novo).
          <Button type="button" variant="secondary" onClick={rodar}>
            Confirmar
          </Button>
          <Button type="button" variant="ghost" onClick={() => setConfirmando(false)}>
            Cancelar
          </Button>
        </span>
      ) : (
        <Button
          type="button"
          variant="secondary"
          loading={rodando}
          disabled={empresas.length === 0}
          onClick={() => setConfirmando(true)}
        >
          Verificar DAS pago de todas ({empresas.length})
        </Button>
      )}
      {progresso && <span className="text-xs text-foreground/60">{progresso}</span>}
      {resumo && <span className="text-xs text-foreground/70">DAS: {resumo}</span>}
    </div>
  );
}

function TabelaPagamentos({ companyId, lista }: { companyId: string; lista: PagamentoFederal[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-foreground/50">
          <th className="px-2 py-1.5 text-left">Tipo</th>
          <th className="px-2 py-1.5 text-left">Receita</th>
          <th className="px-2 py-1.5 text-left">Período</th>
          <th className="px-2 py-1.5 text-left">Vencimento</th>
          <th className="px-2 py-1.5 text-left">Pago em</th>
          <th className="px-2 py-1.5 text-right">Valor</th>
          <th className="px-2 py-1.5 text-right" />
        </tr>
      </thead>
      <tbody className="divide-y divide-border/70">
        {lista.map((p) => (
          <tr key={p.numeroDocumento}>
            <td className="px-2 py-1.5">{p.tipo}</td>
            <td className="px-2 py-1.5">
              {p.receitaCodigo}
              {p.receitaDescricao ? ` · ${p.receitaDescricao}` : ""}
            </td>
            <td className="px-2 py-1.5">{p.periodoApuracao ? p.periodoApuracao.split("-").reverse().join("/") : ""}</td>
            <td className="px-2 py-1.5">{dataBr(p.dataVencimento)}</td>
            <td className="px-2 py-1.5">{dataBr(p.dataArrecadacao)}</td>
            <td className="px-2 py-1.5 text-right">
              {moeda(p.valorTotal)}
              {(p.valorMulta ?? 0) + (p.valorJuros ?? 0) > 0 && (
                <div className="text-[10px] text-warning">
                  multa {moeda(p.valorMulta ?? 0)} · juros {moeda(p.valorJuros ?? 0)}
                </div>
              )}
            </td>
            <td className="px-2 py-1.5 text-right">
              <a
                href={linkComprovante(companyId, p.numeroDocumento)}
                target="_blank"
                rel="noreferrer"
                title="Emite o comprovante na Receita (cobrado na primeira vez; depois fica guardado)"
                className="text-brand hover:underline"
              >
                Comprovante
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
/** Aba Impostos da empresa: todos os pagamentos federais ligados à competência. */
export function PagamentosFederaisPainel({ companyId, competencia }: { companyId: string; competencia: string }) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [dados, setDados] = useState<{ pagamentos: PagamentoFederal[]; paginaCheia: boolean } | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    const r = await consultar(companyId, competencia);
    if (r.ok) setDados({ pagamentos: r.pagamentos, paginaCheia: r.paginaCheia });
    else setErro(r.erro);
    setCarregando(false);
  }

  const doMes = dados?.pagamentos.filter((p) => p.periodoApuracao === competencia) ?? [];
  const outros = dados?.pagamentos.filter((p) => p.periodoApuracao !== competencia) ?? [];



  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Pagamentos federais (DAS e DARF)</h3>
          <p className="text-xs text-foreground/55">
            Consulta na Receita (Integra Contador) o que foi pago a partir do mês seguinte à competência. Cada consulta é
            cobrada; repetir no mesmo dia não cobra de novo.
          </p>
        </div>
        <Button type="button" variant="secondary" loading={carregando} onClick={carregar}>
          {dados ? "Consultar de novo" : "Consultar pagamentos"}
        </Button>
      </div>
      {erro && <p className="text-xs text-danger">{erro}</p>}
      {dados && (
        <>
          {doMes.length ? (
            <TabelaPagamentos companyId={companyId} lista={doMes} />
          ) : (
            <p className="text-xs text-foreground/60">Nenhum pagamento com período de apuração desta competência.</p>
          )}
          {outros.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs text-foreground/60">
                Outros pagamentos no período ({outros.length})
              </summary>
              <div className="mt-2">
                <TabelaPagamentos companyId={companyId} lista={outros} />
              </div>
            </details>
          )}
          {dados.paginaCheia && (
            <p className="text-[11px] text-warning">A Receita devolveu 100 documentos (limite de uma página) — pode haver mais.</p>
          )}
        </>
      )}
    </div>
  );
}
