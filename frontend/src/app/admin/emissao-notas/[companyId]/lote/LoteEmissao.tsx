"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { conferirLote, type LinhaLote } from "@/lib/actions/lote-notas";
import { issueNfse, type IssueNfseState } from "@/lib/actions/notas";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";

type Resultado =
  | { status: "emitindo" }
  | { status: "ok"; dpsId?: string }
  | { status: "erro"; error: string; motivos?: NonNullable<IssueNfseState>["motivos"] };

function dinheiro(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataBr(iso: string) {
  const [a, m, d] = iso.split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

function mascararDocumento(d: string) {
  // Só os 3 últimos dígitos na tela — o suficiente pra conferir.
  return d ? `•••${d.slice(-3)}` : "—";
}

export function LoteEmissao({ companyId, basePath }: { companyId: string; basePath: string }) {
  const [linhas, setLinhas] = useState<LinhaLote[] | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string>();
  const [lendo, setLendo] = useState(false);
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
  const [resultados, setResultados] = useState<Record<number, Resultado>>({});
  const [emitindo, setEmitindo] = useState(false);
  const parar = useRef(false);

  useEffect(() => {
    if (!emitindo) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [emitindo]);

  async function enviar(form: HTMLFormElement) {
    setLendo(true);
    setErroArquivo(undefined);
    setResultados({});
    const res = await conferirLote(new FormData(form)).catch(() => ({ error: "Falha ao ler a planilha.", linhas: undefined }));
    setLendo(false);
    if (res.error || !res.linhas) {
      setErroArquivo(res.error ?? "Falha ao ler a planilha.");
      setLinhas(null);
      return;
    }
    setLinhas(res.linhas);
    // Marca as que estão ok; possíveis duplicadas começam desmarcadas.
    setSelecionadas(
      new Set(
        res.linhas
          .filter((l) => l.erros.length === 0 && !l.avisos.some((a) => a.startsWith("Já existe") || a.startsWith("Repetida")))
          .map((l) => l.linha),
      ),
    );
  }

  const aEmitir = (linhas ?? []).filter((l) => selecionadas.has(l.linha) && resultados[l.linha]?.status !== "ok");
  const total = aEmitir.reduce((s, l) => s + l.valor, 0);
  const totalLiquido = aEmitir.reduce((s, l) => s + l.liquido, 0);
  const emitidas = Object.values(resultados).filter((r) => r.status === "ok").length;
  const recusadas = Object.values(resultados).filter((r) => r.status === "erro").length;

  async function emitirTudo() {
    if (aEmitir.length === 0) return;
    const ok = window.confirm(
      `Emitir ${aEmitir.length} nota(s) de verdade, total ${dinheiro(total)}?\n\nIsso gera NFS-e oficial na Receita. Notas emitidas só podem ser desfeitas por cancelamento.`,
    );
    if (!ok) return;
    parar.current = false;
    setEmitindo(true);
    for (const l of aEmitir) {
      if (parar.current) break;
      setResultados((r) => ({ ...r, [l.linha]: { status: "emitindo" } }));
      const fd = new FormData();
      fd.set("companyId", companyId);
      fd.set("customerId", l.customerId ?? "");
      fd.set("serviceId", l.serviceId ?? "");
      fd.set("amount", l.amount);
      fd.set("description", l.description);
      fd.set("competenceDate", l.competenceDate);
      fd.set("issRetido", l.issRetido ? "1" : "0");
      fd.set("aliquotaIss", l.aliquotaIss);
      fd.set("irrfPct", l.irrfPct);
      fd.set("csrfPct", l.csrfPct);
      fd.set("inssPct", l.inssPct);
      let res: IssueNfseState;
      try {
        res = await issueNfse(undefined, fd);
      } catch {
        res = { error: "Falha de conexão durante a emissão. Confira em “Ver notas” antes de tentar de novo." };
      }
      const resultado: Resultado = res?.success
        ? { status: "ok", dpsId: res.dpsId }
        : { status: "erro", error: res?.error ?? "Não foi possível emitir.", motivos: res?.motivos };
      setResultados((r) => ({ ...r, [l.linha]: resultado }));
      if (resultado.status === "ok") {
        setSelecionadas((s) => {
          const n = new Set(s);
          n.delete(l.linha);
          return n;
        });
      }
    }
    setEmitindo(false);
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-foreground">1. Baixe o modelo e preencha uma linha por nota</p>
          <p className="text-xs text-foreground/55">
            Só CPF/CNPJ e valor são obrigatórios. O tomador precisa já estar cadastrado. O resto em branco usa o
            padrão do serviço.
          </p>
          <a href={`${basePath}/lote/modelo`} className="mt-1 w-fit">
            <Button variant="secondary" type="button">
              Baixar modelo (.xlsx)
            </Button>
          </a>
        </div>
        <form
          className="flex flex-col gap-2 border-t border-border pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar(e.currentTarget);
          }}
        >
          <p className="text-sm font-semibold text-foreground">2. Envie a planilha para conferir</p>
          <p className="text-xs text-foreground/55">Nada é emitido nesta etapa.</p>
          <input type="hidden" name="companyId" value={companyId} />
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              name="arquivo"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              required
              disabled={emitindo}
              className="text-sm"
            />
            <Button type="submit" loading={lendo} disabled={emitindo}>
              Conferir planilha
            </Button>
          </div>
          {erroArquivo && <Alert tone="danger">{erroArquivo}</Alert>}
        </form>
      </Card>

      {linhas && (
        <Card className="flex flex-col gap-4 p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
            <div>
              <p className="text-sm font-semibold text-foreground">3. Confira e emita</p>
              <p className="text-xs text-foreground/55">
                {linhas.length} linha(s) · {linhas.filter((l) => l.erros.length).length} com erro (não serão emitidas) ·{" "}
                {linhas.filter((l) => l.avisos.length && !l.erros.length).length} com aviso
              </p>
            </div>
            <div className="flex items-center gap-3">
              {emitindo ? (
                <Button variant="secondary" type="button" onClick={() => (parar.current = true)}>
                  Parar depois desta
                </Button>
              ) : (
                <Button type="button" onClick={() => void emitirTudo()} disabled={aEmitir.length === 0}>
                  Emitir {aEmitir.length} nota(s) · {dinheiro(total)}
                </Button>
              )}
            </div>
          </div>
          {aEmitir.length > 0 && totalLiquido !== total && (
            <p className="-mt-2 px-5 text-xs text-foreground/55">Líquido a receber das selecionadas: {dinheiro(totalLiquido)}</p>
          )}
          {(emitidas > 0 || recusadas > 0) && (
            <div className="px-5">
              <Alert tone={recusadas ? "warning" : "success"}>
                {emitidas} emitida(s){recusadas ? ` · ${recusadas} recusada(s) — veja o motivo em cada linha` : ""}
                {emitindo ? " · emitindo…" : ""}
              </Alert>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-y border-border bg-foreground/[0.03] text-left text-xs text-foreground/55">
                <tr>
                  <th className="w-8 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="Marcar todas sem erro"
                      disabled={emitindo}
                      checked={linhas.filter((l) => !l.erros.length).every((l) => selecionadas.has(l.linha))}
                      onChange={(e) =>
                        setSelecionadas(
                          new Set(
                            e.target.checked
                              ? linhas.filter((l) => !l.erros.length && resultados[l.linha]?.status !== "ok").map((l) => l.linha)
                              : [],
                          ),
                        )
                      }
                    />
                  </th>
                  <th className="px-2 py-2">Linha</th>
                  <th className="px-2 py-2">Tomador</th>
                  <th className="px-2 py-2">Serviço / descrição</th>
                  <th className="px-2 py-2">Data</th>
                  <th className="px-2 py-2 text-right">Valor</th>
                  <th className="px-2 py-2 text-right">Líquido</th>
                  <th className="px-3 py-2">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {linhas.map((l) => {
                  const r = resultados[l.linha];
                  const travada = l.erros.length > 0 || r?.status === "ok" || emitindo;
                  return (
                    <tr key={l.linha} className={l.erros.length ? "bg-danger-soft/40" : undefined}>
                      <td className="px-3 py-2 align-top">
                        <input
                          type="checkbox"
                          aria-label={`Emitir linha ${l.linha}`}
                          disabled={travada}
                          checked={selecionadas.has(l.linha)}
                          onChange={(e) =>
                            setSelecionadas((s) => {
                              const n = new Set(s);
                              if (e.target.checked) n.add(l.linha);
                              else n.delete(l.linha);
                              return n;
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-2 align-top text-foreground/55">{l.linha}</td>
                      <td className="px-2 py-2 align-top">
                        <div className="font-medium text-foreground">{l.tomador ?? (l.nomePlanilha || "—")}</div>
                        <div className="text-xs text-foreground/50">{mascararDocumento(l.documento)}</div>
                      </td>
                      <td className="max-w-[240px] px-2 py-2 align-top">
                        <div className="text-foreground">{l.servico ?? "—"}</div>
                        <div className="truncate text-xs text-foreground/50" title={l.description}>
                          {l.description}
                        </div>
                      </td>
                      <td className="px-2 py-2 align-top">{l.competenceDate ? dataBr(l.competenceDate) : "—"}</td>
                      <td className="px-2 py-2 text-right align-top">{dinheiro(l.valor)}</td>
                      <td className="px-2 py-2 text-right align-top">
                        {dinheiro(l.liquido)}
                        {l.retido > 0 && <div className="text-xs text-foreground/50">retido {dinheiro(l.retido)}</div>}
                      </td>
                      <td className="max-w-[300px] px-3 py-2 align-top text-xs">
                        {r?.status === "emitindo" && <span className="text-foreground/60">Emitindo…</span>}
                        {r?.status === "ok" && (
                          <span className="font-medium text-success">
                            Emitida ·{" "}
                            {r.dpsId && (
                              <Link href={`${basePath}/notas/${r.dpsId}`} className="underline" target="_blank">
                                ver nota
                              </Link>
                            )}
                          </span>
                        )}
                        {r?.status === "erro" && (
                          <div className="text-danger">
                            <div className="font-medium">{r.error}</div>
                            {r.motivos?.map((m, i) => (
                              <div key={i}>
                                {m.mensagem} {m.acao}
                              </div>
                            ))}
                          </div>
                        )}
                        {!r &&
                          (l.erros.length ? (
                            <div className="text-danger">{l.erros.join(" ")}</div>
                          ) : (
                            <span className="text-foreground/60">Pronta</span>
                          ))}
                        {!r && l.avisos.length > 0 && <div className="mt-0.5 text-warning">{l.avisos.join(" ")}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
