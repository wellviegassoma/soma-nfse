"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  cadastrarContaDoArquivo,
  confirmarArquivoExtrato,
  descartarArquivoExtrato,
  reprocessarArquivoExtrato,
} from "@/lib/actions/extratos-arquivos";
import type { Aviso, Leitura } from "@/lib/extratos-leitura-core";
import { mesmaConta } from "@/lib/extratos-conta";

export type ItemFila = {
  id: string;
  companyId: string | null;
  contaId: string | null;
  competencia: string | null;
  nome: string;
  situacao: string;
  leitura: Leitura | null;
  avisos: Aviso[];
};
type Empresa = { id: string; nome: string };
type Conta = { id: string; companyId: string; rotulo: string };

const brl = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const br = (d: string | null | undefined) => (d ? d.split("-").reverse().join("/") : "?");
const sel = "h-9 w-full rounded-lg border border-border bg-surface px-2 text-sm";

export function FilaConfirmacao({
  itens,
  empresas,
  contas,
  competenciaPadrao,
}: {
  itens: ItemFila[];
  empresas: Empresa[];
  contas: Conta[];
  competenciaPadrao: string;
}) {
  if (!itens.length) {
    return <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-foreground/55">Fila vazia — tudo encaixado. 🎉</div>;
  }
  return (
    <div className="flex flex-col gap-3">
      {itens.map((i) => (
        <Cartao key={i.id} item={i} empresas={empresas} contas={contas} competenciaPadrao={competenciaPadrao} />
      ))}
    </div>
  );
}

function Cartao({ item, empresas, contas, competenciaPadrao }: { item: ItemFila; empresas: Empresa[]; contas: Conta[]; competenciaPadrao: string }) {
  const router = useRouter();
  const l = item.leitura;
  const [companyId, setCompanyId] = useState(item.companyId ?? "");
  const [busca, setBusca] = useState("");
  const contasEmpresa = useMemo(() => contas.filter((c) => c.companyId === companyId), [contas, companyId]);
  const sugestao = contasEmpresa.find((c) => l?.conta && mesmaConta(c.rotulo.split(" · ").pop(), l.conta));
  const [contaId, setContaId] = useState(item.contaId ?? sugestao?.id ?? "");
  const [competencia, setCompetencia] = useState(item.competencia ?? (l?.periodoFim ?? l?.periodoInicio)?.slice(0, 7) ?? competenciaPadrao);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const empresasFiltradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const base = t ? empresas.filter((e) => e.nome.toLowerCase().includes(t)) : empresas;
    return base.slice(0, 300);
  }, [empresas, busca]);

  async function rodar(fn: () => Promise<{ error?: string }>) {
    setOcupado(true);
    setErro(null);
    const r = await fn();
    setOcupado(false);
    if (r.error) setErro(r.error);
    else router.refresh();
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <a href={`/api/extratos/arquivos/${item.id}?ver=1`} target="_blank" rel="noreferrer" className="font-medium text-foreground hover:underline">
            📄 {item.nome}
          </a>
          {l ? (
            <div className="mt-0.5 text-xs text-foreground/60">
              {l.metodo === "IA" ? "IA leu" : "OFX"}: {l.tipoDocumento ?? "documento"} · {l.banco ?? (l.codigoBanco ? `banco ${l.codigoBanco}` : "banco ?")}
              {l.agencia ? ` · ag ${l.agencia}` : ""}
              {l.conta ? ` · conta ${l.conta}` : " · conta não identificada"}
              {l.titularNome ? ` · ${l.titularNome}` : ""}
              {l.titularDocumento ? ` (${l.titularDocumento})` : ""}
              <br />
              Período {br(l.periodoInicio)} a {br(l.periodoFim)} · saldo {brl(l.saldoInicial)} → {brl(l.saldoFinal)}
            </div>
          ) : (
            <div className="mt-0.5 text-xs text-foreground/60">{item.situacao === "PROCESSANDO" ? "Ainda processando…" : "Sem leitura"}</div>
          )}
          {item.avisos.map((a, k) => (
            <div key={k} className="text-xs text-warning">
              ⚠ {a.mensagem}
            </div>
          ))}
        </div>
        <div className="flex gap-3 text-xs">
          <button type="button" disabled={ocupado} className="text-foreground/60 underline" onClick={() => rodar(() => reprocessarArquivoExtrato(item.id))}>
            Ler de novo
          </button>
          <button
            type="button"
            disabled={ocupado}
            className="text-danger underline"
            onClick={() => {
              if (confirm("Descartar este arquivo? Ele sai da fila e não marca nenhum mês.")) rodar(() => descartarArquivoExtrato(item.id));
            }}
          >
            Descartar
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1.4fr_1.4fr_0.8fr_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-xs text-foreground/60">
          Empresa
          <input className={sel} placeholder="Buscar empresa..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          <select
            className={sel}
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value);
              setContaId("");
            }}
          >
            <option value="">— escolha —</option>
            {empresasFiltradas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
            {companyId && !empresasFiltradas.some((e) => e.id === companyId) && (
              <option value={companyId}>{empresas.find((e) => e.id === companyId)?.nome ?? "empresa"}</option>
            )}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground/60">
          Conta
          <select className={sel} value={contaId} onChange={(e) => setContaId(e.target.value)} disabled={!companyId}>
            <option value="">{companyId ? (contasEmpresa.length ? "— escolha —" : "nenhuma conta cadastrada") : "escolha a empresa"}</option>
            {contasEmpresa.map((c) => (
              <option key={c.id} value={c.id}>
                {c.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground/60">
          Mês
          <input type="month" className={sel} value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            className="h-9"
            disabled={!contaId || !competencia}
            loading={ocupado}
            onClick={() => rodar(() => confirmarArquivoExtrato({ arquivoId: item.id, contaId, competencia }))}
          >
            Confirmar
          </Button>
          {companyId && l?.conta && !sugestao && (
            <Button
              variant="secondary"
              className="h-9"
              disabled={ocupado || !competencia}
              onClick={() => rodar(() => cadastrarContaDoArquivo({ arquivoId: item.id, companyId, competencia }))}
              title={`Cadastra ${l.banco ?? ""} ag ${l.agencia ?? "-"} conta ${l.conta} nesta empresa`}
            >
              Cadastrar conta lida
            </Button>
          )}
        </div>
      </div>
      {erro && <div className="mt-2 text-xs text-danger">{erro}</div>}
    </div>
  );
}
