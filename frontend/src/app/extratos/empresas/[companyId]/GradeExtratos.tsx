"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { STATUS_INFO, STATUS_ORDEM, type StatusMes } from "@/lib/extratos-status";
import { ACEITOS, enviarExtrato } from "@/lib/extratos-cliente/enviar";
import {
  definirStatusExtrato,
  descartarArquivoExtrato,
  reprocessarArquivoExtrato,
} from "@/lib/actions/extratos-arquivos";
import type { Aviso, Leitura } from "@/lib/extratos-leitura-core";

export type ContaGrade = { id: string; banco: string; codigoBanco: string | null; agencia: string; conta: string; inicio: string | null; fim: string | null };
export type ArquivoGrade = {
  id: string;
  contaId: string | null;
  competencia: string | null;
  nome: string;
  situacao: string;
  origem: string;
  leitura: Leitura | null;
  avisos: Aviso[];
  criadoEm: string;
};

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesCurto = (c: string) => `${MESES_CURTOS[Number(c.slice(5, 7)) - 1]}/${c.slice(2, 4)}`;
const brl = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const br = (d: string | null | undefined) => (d ? d.split("-").reverse().join("/") : "?");
const semDado = (v: string) => !v || v.trim() === "-";

export function GradeExtratos({
  companyId,
  contas,
  meses,
  status,
  arquivos,
  podeEditar,
}: {
  companyId: string;
  contas: ContaGrade[];
  meses: string[];
  status: Record<string, { status: StatusMes; legadoId: string | null; legadoNome: string | null }>;
  arquivos: ArquivoGrade[];
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [menu, setMenu] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<Record<string, boolean>>({});
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [otimista, setOtimista] = useState<Record<string, StatusMes>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const alvoUpload = useRef<{ contaId: string; competencia: string } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const fechar = () => setMenu(null);
    window.addEventListener("click", fechar);
    return () => window.removeEventListener("click", fechar);
  }, [menu]);

  const arquivosDa = (contaId: string, comp: string) => arquivos.filter((a) => a.contaId === contaId && a.competencia === comp && a.situacao === "IDENTIFICADO");

  async function subir(files: FileList | File[], contaId: string, competencia: string) {
    const chave = `${contaId}|${competencia}`;
    setErro(null);
    setEnviando((e) => ({ ...e, [chave]: true }));
    for (const f of [...files]) {
      const r = await enviarExtrato(f, { companyId, contaId, competencia, origem: "UPLOAD" });
      if (r.error) setErro(r.error);
      else if (r.resultado?.situacao !== "IDENTIFICADO") {
        setErro(`${f.name}: ${r.resultado?.avisos.map((a) => a.mensagem).join(" ") || "precisa de confirmação na fila."}`);
      }
    }
    setEnviando((e) => ({ ...e, [chave]: false }));
    router.refresh();
  }

  function mudarStatus(contaId: string, competencia: string, novo: StatusMes) {
    const chave = `${contaId}|${competencia}`;
    setOtimista((o) => ({ ...o, [chave]: novo }));
    setMenu(null);
    startTransition(async () => {
      const r = await definirStatusExtrato({ contaId, companyId, competencia, status: novo });
      if (r.error) {
        setErro(r.error);
        setOtimista((o) => {
          const n = { ...o };
          delete n[chave];
          return n;
        });
      }
      router.refresh();
    });
  }

  if (!contas.length) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-foreground/55">
        Nenhuma conta bancária cadastrada. Solte um extrato acima que a IA lê a conta e oferece o cadastro, ou cadastre em
        “Contas bancárias”.
      </div>
    );
  }

  const outros = arquivos.filter((a) => a.situacao !== "IDENTIFICADO" || !a.contaId);

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACEITOS}
        className="hidden"
        onChange={(e) => {
          if (e.target.files && alvoUpload.current) subir(e.target.files, alvoUpload.current.contaId, alvoUpload.current.competencia);
          e.target.value = "";
        }}
      />
      {erro && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2 text-sm text-foreground">
          <span>⚠ {erro}</span>
          <button type="button" className="text-xs underline" onClick={() => setErro(null)}>
            fechar
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-foreground/55">
              <th className="px-4 py-2 text-left font-medium">Conta</th>
              {meses.map((m, i) => (
                <th key={m} className={cn("px-2 py-2 text-center font-medium capitalize", i === meses.length - 1 && "text-foreground")}>
                  {mesCurto(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contas.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 align-top">
                  <div className="font-medium text-foreground">{c.banco}</div>
                  <div className="text-xs text-foreground/50">
                    {semDado(c.agencia) && semDado(c.conta) ? "agência e conta não cadastradas" : `ag ${c.agencia} · ${c.conta}`}
                  </div>
                </td>
                {meses.map((m) => {
                  const chave = `${c.id}|${m}`;
                  const fora = (c.inicio && m < c.inicio) || (c.fim && m > c.fim);
                  if (fora) return <td key={m} className="bg-surface-muted/50 text-center text-xs text-foreground/25">—</td>;
                  const st = otimista[chave] ?? status[chave]?.status ?? "PENDENTE";
                  const arqs = arquivosDa(c.id, m);
                  const legado = status[chave]?.legadoId && !arqs.length ? status[chave] : null;
                  const avisos = arqs.flatMap((a) => a.avisos.map((x) => x.mensagem));
                  return (
                    <td
                      key={m}
                      className={cn("relative px-1.5 py-1.5 align-top transition-colors", arrastando === chave && "bg-brand/10")}
                      onDragOver={(e) => {
                        if (!podeEditar) return;
                        e.preventDefault();
                        setArrastando(chave);
                      }}
                      onDragLeave={() => setArrastando(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setArrastando(null);
                        if (podeEditar) subir(e.dataTransfer.files, c.id, m);
                      }}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <button
                          type="button"
                          disabled={!podeEditar}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenu(menu === chave ? null : chave);
                          }}
                          className={cn(
                            "w-full rounded-md px-1.5 py-1 text-xs font-medium",
                            STATUS_INFO[st].pill,
                            avisos.length > 0 && "ring-2 ring-danger/60",
                          )}
                          title={avisos.length ? `⚠ ${avisos.join("\n⚠ ")}` : "Mudar status"}
                        >
                          {enviando[chave] ? "Lendo…" : STATUS_INFO[st].rotulo}
                          {avisos.length > 0 && " ⚠"}
                        </button>
                        <div className="flex w-full items-center justify-center gap-1.5 text-[11px]">
                          {arqs.slice(0, 2).map((a) => (
                            <a key={a.id} href={`/api/extratos/arquivos/${a.id}?ver=1`} target="_blank" rel="noreferrer" className="text-brand hover:underline" title={a.nome}>
                              📄
                            </a>
                          ))}
                          {arqs.length > 2 && <span className="text-foreground/50">+{arqs.length - 2}</span>}
                          {legado && (
                            <a href={`/api/extratos/mensais/${legado.legadoId}`} className="text-brand hover:underline" title={legado.legadoNome ?? "arquivo"}>
                              📄
                            </a>
                          )}
                          {podeEditar && (
                            <button
                              type="button"
                              className="text-foreground/40 hover:text-brand"
                              title="Anexar extrato deste mês"
                              onClick={() => {
                                alvoUpload.current = { contaId: c.id, competencia: m };
                                inputRef.current?.click();
                              }}
                            >
                              ＋
                            </button>
                          )}
                        </div>
                      </div>
                      {menu === chave && (
                        <div className="absolute left-1/2 top-9 z-20 w-40 -translate-x-1/2 rounded-lg border border-border bg-surface p-1 shadow-lg" onClick={(e) => e.stopPropagation()}>
                          {STATUS_ORDEM.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => mudarStatus(c.id, m, s)}
                              className={cn("flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-surface-muted", s === st && "font-semibold")}
                            >
                              <span className={cn("h-2.5 w-2.5 rounded-full", STATUS_INFO[s].ponto)} />
                              {STATUS_INFO[s].rotulo}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="-mt-2 text-xs text-foreground/50">
        Clique no status para mudar · arraste um arquivo para cima de um mês ou use ＋ · 📄 abre o extrato.
      </p>

      <ArquivosRecebidos arquivos={arquivos} contas={contas} podeEditar={podeEditar} destaque={outros.length} />
    </div>
  );
}

function ArquivosRecebidos({ arquivos, contas, podeEditar, destaque }: { arquivos: ArquivoGrade[]; contas: ContaGrade[]; podeEditar: boolean; destaque: number }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  if (!arquivos.length) return null;
  const nomeConta = (id: string | null) => {
    const c = contas.find((x) => x.id === id);
    return c ? `${c.banco} ${semDado(c.conta) ? "" : c.conta}` : "—";
  };
  async function acao(id: string, fn: () => Promise<unknown>) {
    setOcupado(id);
    await fn();
    setOcupado(null);
    router.refresh();
  }
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="text-sm font-semibold text-foreground/70">Arquivos recebidos e leitura da IA</span>
        {destaque > 0 && <span className="text-xs text-warning">{destaque} precisam de confirmação</span>}
      </div>
      <ul className="divide-y divide-border">
        {arquivos.map((a) => {
          const l = a.leitura;
          return (
            <li key={a.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-5 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <a href={`/api/extratos/arquivos/${a.id}?ver=1`} target="_blank" rel="noreferrer" className="font-medium text-foreground hover:underline">
                  {a.nome}
                </a>
                <div className="text-xs text-foreground/55">
                  {a.situacao === "IDENTIFICADO" ? `${nomeConta(a.contaId)} · ${a.competencia ? mesCurto(a.competencia) : ""}` : a.situacao === "ERRO" ? "Falha na leitura" : a.situacao === "PROCESSANDO" ? "Processando" : "Aguardando confirmação na fila"}
                  {l && ` · lido por ${l.metodo === "OFX" ? "OFX" : "IA"}: ${br(l.periodoInicio)} a ${br(l.periodoFim)} · saldo ${brl(l.saldoInicial)} → ${brl(l.saldoFinal)}`}
                  {` · ${a.origem === "WHATSAPP" ? "WhatsApp" : "upload"} ${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(new Date(a.criadoEm))}`}
                </div>
                {a.avisos.map((x, i) => (
                  <div key={i} className="text-xs text-warning">
                    ⚠ {x.mensagem}
                  </div>
                ))}
              </div>
              {podeEditar && (
                <div className="flex gap-2 text-xs">
                  {a.situacao !== "IDENTIFICADO" && (
                    <a href="/extratos/fila" className="text-brand underline">
                      Confirmar
                    </a>
                  )}
                  <button type="button" disabled={ocupado === a.id} className="text-foreground/60 underline" onClick={() => acao(a.id, () => reprocessarArquivoExtrato(a.id))}>
                    {ocupado === a.id ? "…" : "Ler de novo"}
                  </button>
                  <button
                    type="button"
                    disabled={ocupado === a.id}
                    className="text-danger underline"
                    onClick={() => {
                      if (confirm(`Remover "${a.nome}"? O status do mês não muda.`)) acao(a.id, () => descartarArquivoExtrato(a.id, true));
                    }}
                  >
                    Remover
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
