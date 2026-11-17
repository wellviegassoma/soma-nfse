"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { GuiaPagamento, MunicipioIss, PagamentoIss } from "@/lib/iss-pagamentos";

// "Verificar pagamento" das Centrais ISS Rio e Petrópolis (17/11/2026):
// lê no site da Prefeitura se a guia de ISS da competência foi paga — só
// leitura. A célula mostra a última verificação salva; o botão de lote
// avisa cada célula pelo evento abaixo, sem recarregar a página.
const EVENTO = "iss-pagamento-verificado";

type Detalhe = { companyId: string; resultado: PagamentoIss | null; erro?: string };

async function verificar(municipio: MunicipioIss, companyId: string, competencia: string): Promise<Detalhe> {
  try {
    const r = await fetch(`/admin/fechamento/iss-${municipio === "rio" ? "rio" : "petropolis"}/pagamento/${companyId}?competencia=${competencia}`);
    const corpo = await r.json().catch(() => null);
    if (!r.ok) return { companyId, resultado: null, erro: corpo?.error ?? `Erro ${r.status}` };
    return { companyId, resultado: corpo as PagamentoIss };
  } catch {
    return { companyId, resultado: null, erro: "Sem resposta do servidor." };
  }
}

const moeda = (v: number | null | undefined) =>
  v == null ? "" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function dataBr(texto: string | null | undefined): Date | null {
  const m = texto?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 23, 59) : null;
}

function soma(guias: GuiaPagamento[]) {
  return guias.reduce((a, g) => a + (g.valor ?? 0), 0);
}

function Resumo({ p }: { p: PagamentoIss }) {
  const vencimentoAberta = p.abertas.map((a) => a.validade ?? a.vencimento).find(Boolean) ?? null;
  // Vencida na data da verificação (o resultado é sempre de uma verificação).
  const vencida = vencimentoAberta
    ? (dataBr(vencimentoAberta)?.getTime() ?? Infinity) < new Date(p.verificadoEm).getTime()
    : false;
  const quitada = p.pagas.map((g) => g.quitada_em ?? g.pago_em).find(Boolean) ?? null;

  const [rotulo, cor] =
    p.status === "paga"
      ? ["Paga", "bg-success-soft text-success"]
      : p.status === "parcial"
        ? ["Paga em parte", "bg-warning-soft text-warning"]
        : p.status === "aberta"
          ? [vencida ? "Vencida" : "Em aberto", vencida ? "bg-danger/10 text-danger" : "bg-warning-soft text-warning"]
          : p.status === "nao_emitida"
            ? ["Guia não emitida", "bg-surface-muted text-foreground/60"]
            : p.status === "sem_guia"
              ? ["Sem guia no mês", "bg-surface-muted text-foreground/60"]
              : ["Erro", "bg-danger/10 text-danger"];

  return (
    <div>
      <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${cor}`}>{rotulo}</span>
      <div className="mt-0.5 text-[11px] text-foreground/60">
        {p.pagas.length > 0 && (
          <div>
            {quitada ? `em ${quitada} · ` : ""}
            {moeda(soma(p.pagas))}
          </div>
        )}
        {(p.status === "aberta" || p.status === "parcial") && (
          <div>
            {vencimentoAberta ? `vence ${vencimentoAberta} · ` : ""}
            {moeda(soma(p.abertas))}
          </div>
        )}
        {p.mensagem && <div className="text-danger">{p.mensagem}</div>}
      </div>
    </div>
  );
}

export function PagamentoIssCelula({
  companyId,
  municipio,
  competencia,
  inicial,
}: {
  companyId: string;
  municipio: MunicipioIss;
  competencia: string;
  inicial: PagamentoIss | null;
}) {
  const [pagamento, setPagamento] = useState<PagamentoIss | null>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);

  useEffect(() => {
    function aoVerificar(ev: Event) {
      const d = (ev as CustomEvent<Detalhe>).detail;
      if (d.companyId !== companyId) return;
      if (d.resultado) setPagamento(d.resultado);
      setErro(d.erro ?? null);
    }
    window.addEventListener(EVENTO, aoVerificar);
    return () => window.removeEventListener(EVENTO, aoVerificar);
  }, [companyId]);

  async function verificarAgora() {
    setVerificando(true);
    const d = await verificar(municipio, companyId, competencia);
    if (d.resultado) setPagamento(d.resultado);
    setErro(d.erro ?? null);
    setVerificando(false);
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {pagamento ? <Resumo p={pagamento} /> : <span className="text-[11px] text-foreground/40">não verificado</span>}
      {erro && <p className="max-w-[220px] text-[10px] text-danger">{erro}</p>}
      <button
        type="button"
        disabled={verificando}
        onClick={verificarAgora}
        title={pagamento ? `Última verificação: ${new Date(pagamento.verificadoEm).toLocaleString("pt-BR")}` : undefined}
        className="text-[11px] font-medium text-brand hover:underline disabled:opacity-50"
      >
        {verificando ? "Verificando…" : pagamento ? "Verificar de novo" : "Verificar pagamento"}
      </button>
    </div>
  );
}

export function VerificarPagamentosLote({
  municipio,
  competencia,
  empresas,
}: {
  municipio: MunicipioIss;
  competencia: string;
  empresas: { id: string; nome: string }[];
}) {
  const [rodando, setRodando] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [resumo, setResumo] = useState<string | null>(null);

  async function rodar() {
    setRodando(true);
    setResumo(null);
    const cont: Record<string, number> = {};
    for (let i = 0; i < empresas.length; i++) {
      setProgresso(`${i + 1}/${empresas.length} — ${empresas[i].nome}`);
      const d = await verificar(municipio, empresas[i].id, competencia);
      window.dispatchEvent(new CustomEvent<Detalhe>(EVENTO, { detail: d }));
      const chave = d.resultado?.status ?? "erro";
      cont[chave] = (cont[chave] ?? 0) + 1;
    }
    const nomes: Record<string, string> = {
      paga: "pagas",
      parcial: "pagas em parte",
      aberta: "em aberto",
      nao_emitida: "sem guia emitida",
      sem_guia: "sem guia no mês",
      erro: "com erro",
    };
    setResumo(
      Object.entries(cont)
        .map(([k, n]) => `${n} ${nomes[k] ?? k}`)
        .join(" · "),
    );
    setProgresso(null);
    setRodando(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="secondary" loading={rodando} disabled={empresas.length === 0} onClick={rodar}>
        Verificar pagamento de todas ({empresas.length})
      </Button>
      {progresso && <span className="text-xs text-foreground/60">{progresso}</span>}
      {resumo && <span className="text-xs text-foreground/70">Pagamento: {resumo}</span>}
    </div>
  );
}
