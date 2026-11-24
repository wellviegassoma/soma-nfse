"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import JSZip from "jszip";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import {
  aprovarRecomendacoesAction,
  dasSalvoBase64Action,
  enviarMensagensAction,
  gerarDasSerenaAction,
  marcarEntregueAction,
  previaMensagensAction,
  revisarSerenaAction,
  salvarRevisoresAction,
  type MensagemPrevia,
} from "@/lib/actions/serena";
import { rotuloCompetencia, somarMeses } from "@/lib/tarefas-comum";
import type { EstadoEtapa, LinhaSerena } from "@/lib/serena";
import type { ResumoRotina } from "@/lib/serena-rotina";
import { BuscarTodasButton } from "../fechamento/BuscarTodasButton";
import { ConferirPrefeituraLoteButton } from "../fechamento/simples/ConferirPrefeituraLoteButton";
import { EnviarSimplesLoteButton } from "../fechamento/simples/EnviarSimplesLoteButton";

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const COR: Record<EstadoEtapa, string> = {
  ok: "border-emerald-500 text-emerald-600",
  pendente: "border-amber-400 text-amber-500",
  problema: "border-rose-500 text-rose-600",
  na: "border-border text-foreground/30",
};
const ICONE: Record<EstadoEtapa, string> = { ok: "✓", pendente: "…", problema: "!", na: "–" };

type Filtro = "acao" | "serena" | "concluida" | "todas";

export function SerenaPainel({
  competencia,
  linhas,
  equipe,
  revisores,
  ultimaRotina,
}: {
  competencia: string;
  linhas: LinhaSerena[];
  equipe: { id: string; nome: string }[];
  revisores: string[];
  ultimaRotina: ResumoRotina | null;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("acao");
  const [cidade, setCidade] = useState("");
  const [busca, setBusca] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; erro?: string } | null>(null);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [previa, setPrevia] = useState<{ tipo: "GUIA" | "COBRANCA"; mensagens: MensagemPrevia[] } | null>(null);
  const [zipBaixado, setZipBaixado] = useState<string[] | null>(null);
  const [rev, setRev] = useState<string[]>(revisores);
  const [limiteRevisao, setLimiteRevisao] = useState("");

  const conta = (f: Filtro) => (f === "todas" ? linhas.length : linhas.filter((l) => l.situacao === f).length);
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter(
      (l) => (filtro === "todas" || l.situacao === filtro) && (!cidade || l.municipio === cidade) && (!q || l.nome.toLowerCase().includes(q)),
    );
  }, [linhas, filtro, cidade, busca]);

  // Grupos para as ações em lote (sempre sobre a carteira inteira).
  const g = useMemo(() => {
    const iaAtual = (l: LinhaSerena) => l.serena?.ia_decisao && l.serena.ia_assinatura === l.assinatura;
    return {
      todas: linhas.map((l) => ({ id: l.id, nome: l.nome })),
      petropolis: linhas.filter((l) => l.municipio === "Petrópolis").map((l) => ({ id: l.id, nome: l.nome })),
      revisar: linhas.filter((l) => l.conferencia === "REVISAR" && !l.aprovada && !iaAtual(l)),
      recomendadas: linhas.filter((l) => !l.aprovada && l.serena?.ia_decisao === "APROVAR" && l.serena.ia_assinatura === l.assinatura),
      transmitir: linhas.filter((l) => l.aprovada && !l.declarada).map((l) => ({ id: l.id, nome: l.nome })),
      gerarDas: linhas.filter((l) => l.declarada && l.das > 0 && !l.serena?.das_gerado_em),
      zip: linhas.filter((l) => l.serena?.das_gerado_em && !l.serena.entregue_em),
      guia: linhas.filter((l) => l.serena?.entregue_em && !l.serena.mensagem_guia_em && l.temGrupoDigisac),
      verificar: linhas.filter((l) => l.serena?.entregue_em && l.das > 0 && !l.pago),
      cobrar: linhas.filter((l) => l.serena?.entregue_em && l.pago === false && !l.serena.mensagem_cobranca_em && l.temGrupoDigisac),
    };
  }, [linhas]);

  const tot = useMemo(
    () => ({
      calculadas: linhas.filter((l) => !l.etapas.find((e) => e.chave === "calculo" && e.estado === "problema")).length,
      transmitidas: linhas.filter((l) => l.declarada).length,
      receita: linhas.reduce((s, l) => s + l.receita, 0),
      das: linhas.reduce((s, l) => s + l.das, 0),
      dasGerados: linhas.filter((l) => l.serena?.das_gerado_em).length,
      entregues: linhas.filter((l) => l.serena?.entregue_em).length,
      pagos: linhas.filter((l) => l.pago).length,
      comDas: linhas.filter((l) => l.das > 0).length,
    }),
    [linhas],
  );

  const emLote = async <T,>(itens: T[], rotulo: string, fn: (i: T) => Promise<string | null>) => {
    const erros: string[] = [];
    for (const [k, i] of itens.entries()) {
      setProgresso(`${rotulo} ${k + 1} de ${itens.length}…`);
      const e = await fn(i);
      if (e) erros.push(e);
    }
    setProgresso(null);
    return erros;
  };

  const revisar = () =>
    iniciar(async () => {
      let ap = 0;
      let es = 0;
      let custo = 0;
      const n = Number(limiteRevisao);
      const ids = g.revisar.map((l) => l.id).slice(0, n > 0 ? n : undefined);
      for (let i = 0; i < ids.length; i += 5) {
        setProgresso(`Serena revisando ${Math.min(i + 5, ids.length)} de ${ids.length}…`);
        const r = await revisarSerenaAction({ competencia, companyIds: ids.slice(i, i + 5) });
        if ("error" in r) {
          setMsg({ erro: r.error });
          setProgresso(null);
          return;
        }
        ap += r.aprovadas;
        es += r.escaladas;
        custo += r.custoUsd;
      }
      setProgresso(null);
      setMsg({ ok: `Serena revisou ${ids.length}: recomenda aprovar ${ap}, passou ${es} para a equipe (custo ~US$ ${custo.toFixed(2)}).` });
      router.refresh();
    });

  const aprovar = () => {
    if (!window.confirm(`Aprovar as ${g.recomendadas.length} empresa(s) que a Serena recomendou? Você é quem confirma.`)) return;
    iniciar(async () => {
      const r = await aprovarRecomendacoesAction({ competencia, itens: g.recomendadas.map((l) => ({ companyId: l.id, assinatura: l.assinatura })) });
      setMsg("error" in r ? { erro: r.error } : { ok: r.mensagem });
      router.refresh();
    });
  };

  const gerarDas = () => {
    if (!window.confirm(`Gerar e salvar ${g.gerarDas.length} DAS? Cada geração é uma consulta cobrada do Integra Contador (só uma vez por empresa).`)) return;
    iniciar(async () => {
      const erros = await emLote(g.gerarDas, "Gerando DAS", async (l) => {
        const r = await gerarDasSerenaAction({ companyId: l.id, competencia });
        return "error" in r ? `${l.nome}: ${r.error}` : null;
      });
      setMsg(erros.length ? { erro: `${erros.length} com erro: ${erros.slice(0, 3).join("; ")}` } : { ok: "DAS gerados e salvos." });
      router.refresh();
    });
  };

  const baixarZip = () =>
    iniciar(async () => {
      const zip = new JSZip();
      const ok: string[] = [];
      const erros = await emLote(g.zip, "Montando ZIP", async (l) => {
        const r = await dasSalvoBase64Action({ companyId: l.id, competencia });
        if ("error" in r) return `${l.nome}: ${r.error}`;
        zip.file(`${l.nome.replace(/[\\/:*?"<>|]/g, "")} - DAS ${competencia}.pdf`, r.base64, { base64: true });
        ok.push(l.id);
        return null;
      });
      if (ok.length) {
        const conteudo = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(conteudo);
        const a = document.createElement("a");
        a.href = url;
        a.download = `serena-das-${competencia}.zip`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
        setZipBaixado(ok);
      }
      setMsg(erros.length ? { erro: `${erros.length} sem arquivo: ${erros.slice(0, 3).join("; ")}` } : { ok: `ZIP com ${ok.length} DAS baixado — suba no eContador e marque como entregue.` });
    });

  const marcarEntregue = () =>
    iniciar(async () => {
      const r = await marcarEntregueAction({ competencia, companyIds: zipBaixado ?? [] });
      setMsg("error" in r ? { erro: r.error } : { ok: r.mensagem });
      setZipBaixado(null);
      router.refresh();
    });

  const prepararMensagens = (tipo: "GUIA" | "COBRANCA") =>
    iniciar(async () => {
      const itens = (tipo === "GUIA" ? g.guia : g.cobrar).map((l) => ({ companyId: l.id, empresa: l.nome.replace(/^\d+ · /, ""), das: l.das }));
      const r = await previaMensagensAction({ competencia, tipo, itens });
      if ("error" in r) setMsg({ erro: r.error });
      else setPrevia({ tipo, mensagens: r.mensagens });
    });

  const enviarMensagens = () => {
    if (!previa) return;
    if (!window.confirm(`Enviar ${previa.mensagens.length} mensagem(ns) nos grupos do WhatsApp (Digisac)?`)) return;
    iniciar(async () => {
      const r = await enviarMensagensAction({ competencia, tipo: previa.tipo, mensagens: previa.mensagens.map((m) => ({ companyId: m.companyId, texto: m.texto })) });
      setMsg("error" in r ? { erro: r.error } : { ok: r.mensagem });
      setPrevia(null);
      router.refresh();
    });
  };

  const verificarPagamentos = () => {
    if (!window.confirm(`Verificar o pagamento de ${g.verificar.length} DAS? Cada consulta à Receita (Integra Contador) é cobrada.`)) return;
    iniciar(async () => {
      const erros = await emLote(g.verificar, "Verificando pagamento", async (l) => {
        const r = await fetch(`/admin/empresas/${l.id}/integra-contador/pagamentos?competencia=${competencia}`, { cache: "no-store" });
        return r.ok ? null : `${l.nome}: HTTP ${r.status}`;
      });
      setMsg(erros.length ? { erro: `${erros.length} com erro` } : { ok: "Pagamentos verificados." });
      router.refresh();
    });
  };

  const btn = "rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-muted disabled:opacity-40";
  const btnP = "rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground disabled:opacity-40";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Serena · Simples Nacional</h1>
          <p className="text-sm text-foreground/60">
            Carteira de IA: todas as empresas do Simples de Petrópolis e do Rio ({linhas.length}). Casos que a Serena não resolve vão para a equipe do Fiscal.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/admin/serena?competencia=${somarMeses(competencia, -1)}`} className="rounded-lg border border-border px-2 py-1">
            ‹
          </Link>
          <span className="font-semibold">Competência {rotuloCompetencia(competencia)}</span>
          <Link href={`/admin/serena?competencia=${somarMeses(competencia, 1)}`} className="rounded-lg border border-border px-2 py-1">
            ›
          </Link>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">Apuração</div>
          <div className="text-lg font-semibold">
            {tot.calculadas}/{linhas.length} calculadas
          </div>
          <div className="text-xs text-foreground/60">
            {tot.transmitidas} transmitidas · {linhas.length - tot.transmitidas} aguardando
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">Valores</div>
          <div className="text-lg font-semibold">{brl(tot.receita)}</div>
          <div className="text-xs text-foreground/60">{brl(tot.das)} de Simples calculado</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/50">Conclusão</div>
          <div className="text-lg font-semibold">
            {tot.dasGerados}/{tot.comDas} DAS gerados
          </div>
          <div className="text-xs text-foreground/60">
            {tot.entregues} entregues · {tot.pagos} pagos
          </div>
        </Card>
      </div>

      {/* Esteira do mês: ações em lote, na ordem */}
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-sm font-semibold">Fluxo do mês (na ordem)</div>
          <div className="text-xs text-foreground/60">
            {ultimaRotina
              ? `Rotina automática (motor 7h30 e 11h30, IA 8h30 e 12h30, dias 1–25): última em ${new Date(ultimaRotina.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} — ${ultimaRotina.conferidas} conferida(s) na prefeitura, ${ultimaRotina.revisadas} revisada(s) (${ultimaRotina.aprovadas} para aprovar, ${ultimaRotina.escaladas} para a equipe)${ultimaRotina.faltamRevisar ? `, faltam ${ultimaRotina.faltamRevisar}` : ""}${ultimaRotina.erro ? ` · erro: ${ultimaRotina.erro}` : ""}`
              : "Rotina automática: motor às 7h30 e 11h30, auditoria com IA às 8h30 e 12h30 (dias 1–25) — ainda não rodou."}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-foreground/50">1.</span>
          <div className="[&_button]:!h-8 [&_button]:!text-xs">
            <BuscarTodasButton competencia={competencia} empresas={g.todas} />
          </div>
          <span className="text-xs text-foreground/50">2.</span>
          <div className="[&_button]:!h-8 [&_button]:!text-xs">
            <ConferirPrefeituraLoteButton competencia={competencia} empresas={g.petropolis} />
          </div>
          <span className="text-xs text-foreground/50">3.</span>
          <button type="button" className={btnP} disabled={pendente || !g.revisar.length} onClick={revisar}>
            Serena revisar ({limiteRevisao && Number(limiteRevisao) > 0 ? `${Math.min(Number(limiteRevisao), g.revisar.length)} de ` : ""}
            {g.revisar.length})
          </button>
          <input
            type="number"
            min={1}
            value={limiteRevisao}
            onChange={(e) => setLimiteRevisao(e.target.value)}
            placeholder="todas"
            title="Quantas revisar agora (vazio = todas)"
            className="h-8 w-16 rounded-lg border border-border bg-surface px-2 text-xs"
          />
          <span className="text-xs text-foreground/50">4.</span>
          <button type="button" className={btn} disabled={pendente || !g.recomendadas.length} onClick={aprovar}>
            Aprovar recomendações ({g.recomendadas.length})
          </button>
          <span className="text-xs text-foreground/50">5.</span>
          <div className="[&_button]:!h-8 [&_button]:!text-xs">
            <EnviarSimplesLoteButton competencia={competencia} empresas={g.transmitir} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-foreground/50">6.</span>
          <button type="button" className={btn} disabled={pendente || !g.gerarDas.length} onClick={gerarDas}>
            Gerar e salvar DAS ({g.gerarDas.length})
          </button>
          <span className="text-xs text-foreground/50">7.</span>
          <button type="button" className={btn} disabled={pendente || !g.zip.length} onClick={baixarZip}>
            Baixar ZIP para o eContador ({g.zip.length})
          </button>
          {zipBaixado && (
            <button type="button" className={btnP} disabled={pendente} onClick={marcarEntregue}>
              Marcar {zipBaixado.length} como entregues
            </button>
          )}
          <span className="text-xs text-foreground/50">8.</span>
          <button type="button" className={btn} disabled={pendente || !g.guia.length} onClick={() => prepararMensagens("GUIA")}>
            Mensagem &quot;guia disponível&quot; ({g.guia.length})
          </button>
          <span className="text-xs text-foreground/50">9.</span>
          <button type="button" className={btn} disabled={pendente || !g.verificar.length} onClick={verificarPagamentos}>
            Verificar pagamentos ({g.verificar.length})
          </button>
          <span className="text-xs text-foreground/50">10.</span>
          <button type="button" className={btn} disabled={pendente || !g.cobrar.length} onClick={() => prepararMensagens("COBRANCA")}>
            Cobrança no Digisac ({g.cobrar.length})
          </button>
        </div>
        {(progresso || msg) && (
          <div className={cn("text-sm", msg?.erro ? "text-danger" : "text-foreground/70")}>{progresso ?? msg?.erro ?? msg?.ok}</div>
        )}
        <details className="text-xs text-foreground/60">
          <summary className="cursor-pointer">Quem recebe os casos que a Serena não aprova</summary>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {equipe.map((u) => (
              <label key={u.id} className="flex items-center gap-1">
                <input type="checkbox" checked={rev.includes(u.id)} onChange={(e) => setRev(e.target.checked ? [...rev, u.id] : rev.filter((x) => x !== u.id))} />
                {u.nome}
              </label>
            ))}
            <button
              type="button"
              className={btn}
              disabled={pendente}
              onClick={() => iniciar(async () => {
                const r = await salvarRevisoresAction(rev);
                setMsg("error" in r ? { erro: r.error } : { ok: r.mensagem });
              })}
            >
              Salvar
            </button>
            <span>(revezam entre os marcados; vira tarefa em Tarefas)</span>
          </div>
        </details>
      </Card>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["acao", "Precisa de ação"],
            ["serena", "Com a Serena"],
            ["concluida", "Concluídas"],
            ["todas", "Todas"],
          ] as [Filtro, string][]
        ).map(([f, r]) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={cn("rounded-lg px-3 py-1.5 text-sm", filtro === f ? "bg-brand text-brand-foreground" : "border border-border bg-surface text-foreground/70")}
          >
            {r} <strong>{conta(f)}</strong>
          </button>
        ))}
        <select value={cidade} onChange={(e) => setCidade(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-2 text-sm">
          <option value="">Petrópolis e Rio</option>
          <option value="Petrópolis">Petrópolis</option>
          <option value="Rio de Janeiro">Rio de Janeiro</option>
        </select>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa" className="h-9 w-56 rounded-lg border border-border bg-surface px-3 text-sm" />
      </div>

      {/* Esteira por empresa */}
      <Card className="divide-y divide-border">
        {visiveis.length === 0 && <div className="p-6 text-center text-sm text-foreground/60">Nada aqui.</div>}
        {visiveis.map((l) => (
          <div key={l.id} className="flex min-w-0 flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center">
            <div className="w-full shrink-0 lg:w-56">
              <div className="truncate text-sm font-medium" title={l.nome}>
                {l.nome}
              </div>
              <div className="text-[11px] text-foreground/50">
                {l.municipio} · Anexo {l.anexo}
                {l.fatorR != null ? ` · FR ${(l.fatorR * 100).toFixed(1)}%` : ""}
              </div>
            </div>
            <div className="flex min-w-0 flex-1 items-start overflow-x-auto">
              {l.etapas.map((e, i) => (
                <div key={e.chave} className="flex min-w-[88px] flex-1 items-start">
                  <div className="flex flex-1 flex-col items-center text-center">
                    <div className="text-[10px] text-foreground/50">{e.nome}</div>
                    <div className={cn("mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold", COR[e.estado])}>{ICONE[e.estado]}</div>
                    <div className="mt-0.5 text-[11px] font-medium leading-tight">{e.titulo}</div>
                    {e.detalhe && <div className="text-[10px] leading-tight text-foreground/50">{e.detalhe}</div>}
                  </div>
                  {i < l.etapas.length - 1 && <div className={cn("mt-[22px] h-0.5 w-3 shrink-0", e.estado === "ok" ? "bg-emerald-400" : "bg-border")} />}
                </div>
              ))}
            </div>
            <div className="w-full shrink-0 lg:w-72">
              <div
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-xs",
                  l.situacao === "acao" ? "bg-amber-50 text-amber-900" : l.situacao === "concluida" ? "bg-emerald-50 text-emerald-900" : "bg-violet-50 text-violet-900",
                )}
              >
                <span className="font-semibold">Serena:</span> {l.recado}
                {l.serena?.ia_acoes && l.serena.ia_acoes.length > 0 && l.serena.ia_assinatura === l.assinatura && !l.aprovada && (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {l.serena.ia_acoes.map((a, i) => (
                      <li key={i}>
                        →{" "}
                        {a.onde.startsWith("/") ? (
                          <Link href={a.onde} className="underline">
                            {a.acao}
                          </Link>
                        ) : (
                          `${a.acao} (${a.onde})`
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="mt-1 flex gap-3 text-[11px]">
                <Link href={`/admin/fechamento/simples?competencia=${competencia}`} className="text-brand underline">
                  Central do Simples
                </Link>
                {l.serena?.tarefa_id && (
                  <Link href={`/admin/empresas/${l.id}/tarefas`} className="text-brand underline">
                    tarefa da equipe
                  </Link>
                )}
                {!l.temGrupoDigisac && <span className="text-foreground/50">sem grupo no Digisac</span>}
              </div>
            </div>
          </div>
        ))}
      </Card>

      {previa && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/30 p-4" onClick={() => setPrevia(null)}>
          <div className="mt-10 w-full max-w-2xl rounded-xl bg-background p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 text-base font-semibold">{previa.tipo === "GUIA" ? "Mensagem: guia disponível" : "Mensagem: cobrança"}</h2>
            <p className="mb-3 text-xs text-foreground/60">Revise e ajuste antes de enviar. Vai para o grupo do WhatsApp de cada cliente (Digisac).</p>
            <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
              {previa.mensagens.map((m, i) => (
                <div key={m.companyId} className="rounded-lg border border-border p-2">
                  <div className="mb-1 text-xs font-medium">
                    {m.empresa} <span className="text-foreground/50">→ {m.grupo ?? "sem grupo"}</span>
                  </div>
                  <textarea
                    value={m.texto}
                    rows={3}
                    onChange={(e) => setPrevia({ ...previa, mensagens: previa.mensagens.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)) })}
                    className="w-full rounded border border-border bg-surface px-2 py-1 text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className={btn} onClick={() => setPrevia(null)}>
                Cancelar
              </button>
              <button type="button" className={btnP} disabled={pendente} onClick={enviarMensagens}>
                Enviar {previa.mensagens.length}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
