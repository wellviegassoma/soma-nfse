"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { cn } from "@/lib/cn";
import {
  enviarPlanilhaAgendaAction,
  reimportarAgendaAction,
  type AgendaActionState,
} from "@/lib/actions/agenda-tributaria";

export type AgendaLinha = {
  id: number;
  tipo: "TRIBUTO" | "DECLARACAO";
  dia: number | null;
  dia_texto: string | null;
  vencimento: string | null;
  codigo: string | null;
  grupo: string | null;
  descricao: string;
  periodo: string | null;
  documento: string | null;
  relevante: boolean;
};

const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DIAS_SEMANA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function nomeMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return `${NOMES_MES[m - 1]} de ${a}`;
}

function dataUtc(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function somarDias(iso: string, n: number) {
  const d = dataUtc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function diasAte(de: string, ate: string) {
  return Math.round((dataUtc(ate).getTime() - dataUtc(de).getTime()) / 86_400_000);
}

function dataPorExtenso(iso: string) {
  const d = dataUtc(iso);
  return `${DIAS_SEMANA[d.getUTCDay()]}, ${d.getUTCDate()} de ${NOMES_MES[d.getUTCMonth()].toLowerCase()}`;
}

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Rótulo curto de cada obrigação para caber na célula do calendário.
const ABREVIACOES: Record<string, string> = {
  "Contribuição Previdenciária": "INSS",
  "Simples Nacional": "DAS",
  "Simples Doméstico": "DAE",
  "PIS/Pasep": "PIS",
  "Cide - Combustíveis": "Cide",
  "Cide - Remessas ao Exterior": "Cide",
};

function rotuloCurto(l: AgendaLinha): string {
  if (l.tipo === "DECLARACAO") return l.descricao.split(/\s[–-]\s/)[0].trim();
  return ABREVIACOES[l.grupo ?? ""] ?? l.grupo ?? "—";
}

type Etiqueta = { rotulo: string; tipo: AgendaLinha["tipo"]; n: number };

function etiquetas(itens: AgendaLinha[]): Etiqueta[] {
  const m = new Map<string, Etiqueta>();
  for (const l of itens) {
    const rotulo = rotuloCurto(l);
    const k = `${l.tipo}:${rotulo}`;
    const e = m.get(k) ?? { rotulo, tipo: l.tipo, n: 0 };
    e.n++;
    m.set(k, e);
  }
  // Pagamentos primeiro, depois declarações; dentro de cada, os mais frequentes.
  return [...m.values()].sort((a, b) => (a.tipo === b.tipo ? b.n - a.n : a.tipo === "TRIBUTO" ? -1 : 1));
}

type Selecao = string; // YYYY-MM-DD | "diario" | "outros"

export function AgendaTributariaLista({
  mes,
  hoje,
  info,
  linhas,
  erro,
  hrefAnterior,
  hrefProximo,
  hrefAtual,
}: {
  mes: string;
  hoje: string;
  info: { ade: string | null; fonte_url: string | null; origem: string; importado_em: string } | null;
  linhas: AgendaLinha[];
  erro: string | null;
  hrefAnterior: string;
  hrefProximo: string;
  hrefAtual: string;
}) {
  const [todas, setTodas] = useState(false);
  const [busca, setBusca] = useState("");

  // "Próximos 7 dias" (hoje + 6): no fim de semana já mostra a semana que
  // vem, em vez de uma semana que acabou.
  const fimSemana = somarDias(hoje, 6);

  const filtradas = useMemo(() => {
    const q = semAcento(busca.trim());
    return linhas.filter((l) => {
      if (!todas && !l.relevante) return false;
      if (!q) return true;
      return semAcento(
        [l.codigo, l.grupo, l.descricao, l.periodo, l.documento].filter(Boolean).join(" "),
      ).includes(q);
    });
  }, [linhas, todas, busca]);

  const porChave = useMemo(() => {
    const m = new Map<Selecao, AgendaLinha[]>();
    for (const l of filtradas) {
      const k = l.vencimento ?? (l.dia === 0 ? "diario" : "outros");
      const arr = m.get(k) ?? [];
      arr.push(l);
      m.set(k, arr);
    }
    return m;
  }, [filtradas]);

  // Dia aberto por padrão: hoje, senão o próximo vencimento, senão o 1º do mês.
  const datas = [...porChave.keys()].filter((k) => /^\d{4}/.test(k)).sort();
  const padrao: Selecao | null =
    (porChave.has(hoje) ? hoje : null) ?? datas.find((d) => d >= hoje) ?? datas[0] ?? null;
  const [escolhida, setEscolhida] = useState<Selecao | null>(null);
  const selecao = escolhida && porChave.has(escolhida) ? escolhida : padrao;

  // Grade do mês: começa no domingo da 1ª semana, termina no sábado da última.
  const primeiro = `${mes}-01`;
  const [ano, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10);
  const inicioGrade = somarDias(primeiro, -dataUtc(primeiro).getUTCDay());
  const fimGrade = somarDias(ultimo, 6 - dataUtc(ultimo).getUTCDay());
  const celulas: string[] = [];
  for (let d = inicioGrade; d <= fimGrade; d = somarDias(d, 1)) celulas.push(d);

  const venceHoje = porChave.get(hoje)?.length ?? 0;
  const venceSemana = filtradas.filter(
    (l) => l.vencimento && l.vencimento >= hoje && l.vencimento <= fimSemana,
  ).length;
  const totalRelevantes = linhas.filter((l) => l.relevante).length;
  const buscando = busca.trim() !== "";
  const mesCorrente = mes === hoje.slice(0, 7);

  return (
    <Card id="agenda-tributaria" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <div className="text-base font-semibold text-foreground">Prazos e vencimentos</div>
          <div className="text-xs text-foreground/50">
            Agenda tributária da Receita Federal
            {info && (
              <>
                {" · "}
                {info.fonte_url?.startsWith("http") ? (
                  <a href={info.fonte_url} target="_blank" rel="noreferrer" className="underline">
                    {info.ade ?? "fonte"}
                  </a>
                ) : (
                  info.ade
                )}
                {" · importada em "}
                {new Date(info.importado_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </>
            )}
          </div>
        </div>
        {info && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setTodas(false)}
                className={cn("rounded-md px-2.5 py-1", !todas ? "bg-brand text-brand-foreground" : "text-foreground/70")}
              >
                Relevantes SOMA ({totalRelevantes})
              </button>
              <button
                type="button"
                onClick={() => setTodas(true)}
                className={cn("rounded-md px-2.5 py-1", todas ? "bg-brand text-brand-foreground" : "text-foreground/70")}
              >
                Todas ({linhas.length})
              </button>
            </div>
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar código ou tributo"
              className="h-8 w-52 rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
            />
          </div>
        )}
      </div>

      {erro && (
        <div className="px-5 pt-4">
          <Alert>Não foi possível ler a agenda: {erro}</Alert>
        </div>
      )}

      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* ------------------------------------------------ calendário */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <Link href={hrefAnterior} scroll={false} aria-label="Mês anterior"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-brand hover:bg-brand hover:text-brand-foreground">
              ‹
            </Link>
            <Link href={hrefAtual} scroll={false} className="text-sm font-semibold text-foreground hover:underline">
              {nomeMes(mes)}
            </Link>
            <Link href={hrefProximo} scroll={false} aria-label="Próximo mês"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-brand hover:bg-brand hover:text-brand-foreground">
              ›
            </Link>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {DIAS_SEMANA_CURTO.map((d) => (
              <div key={d} className="pb-1 text-center text-xs font-medium text-foreground/50">{d}</div>
            ))}
            {celulas.map((d) => {
              const doMes = d.slice(0, 7) === mes;
              const itens = doMes ? porChave.get(d) ?? [] : [];
              const tem = itens.length > 0;
              const ehHoje = d === hoje;
              const proximo = d > hoje && d <= fimSemana;
              const passou = d < hoje;
              const selecionado = selecao === d;
              const fimDeSemana = [0, 6].includes(dataUtc(d).getUTCDay());
              const tags = etiquetas(itens);
              return (
                <button
                  key={d}
                  type="button"
                  disabled={!tem}
                  onClick={() => setEscolhida(d)}
                  className={cn(
                    "group relative flex min-h-14 flex-col items-stretch rounded-lg border p-1 text-left transition sm:min-h-[86px] sm:p-1.5",
                    !doMes && "invisible",
                    // Próximos 7 dias: amarelo forte. Hoje: vinho — o mais chamativo.
                    // (classes exclusivas: o cn não resolve conflito de bg/border)
                    !tem
                      ? cn("cursor-default border-border/50", fimDeSemana && "bg-surface-muted/50")
                      : ehHoje
                        ? "cursor-pointer border-rose-950 bg-rose-900 text-white shadow-md"
                        : proximo
                          ? "cursor-pointer border-amber-500 bg-amber-300 text-amber-950 shadow-sm hover:border-amber-600"
                          : "cursor-pointer border-border bg-surface shadow-sm hover:border-brand/60 hover:shadow",
                    tem && passou && !selecionado && "opacity-55",
                    selecionado && "ring-2 ring-brand ring-offset-1 ring-offset-surface",
                  )}
                >
                  <span className="flex items-center justify-between">
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                        ehHoje && tem
                          ? "bg-white font-bold text-rose-900"
                          : ehHoje
                            ? "bg-brand font-bold text-brand-foreground"
                            : tem && proximo
                              ? "font-bold text-amber-950"
                              : tem
                                ? "font-bold text-brand"
                                : "text-foreground/40",
                      )}
                    >
                      {Number(d.slice(8, 10))}
                    </span>
                    {tem && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 text-[10px] font-semibold",
                          ehHoje ? "bg-white/20 text-white" : proximo ? "bg-white/60 text-amber-950" : "bg-surface-muted text-foreground/60",
                        )}
                      >
                        {itens.length}
                      </span>
                    )}
                  </span>
                  {tem && (
                    <span className="mt-1 hidden flex-wrap gap-0.5 sm:flex">
                      {tags.slice(0, 3).map((t) => (
                        <span
                          key={t.tipo + t.rotulo}
                          className={cn(
                            "max-w-full truncate rounded px-1 text-[10px] font-medium leading-4",
                            ehHoje || proximo ? "bg-white/90" : t.tipo === "TRIBUTO" ? "bg-brand-soft" : "bg-success-soft",
                            t.tipo === "TRIBUTO" ? "text-brand" : "text-success",
                          )}
                        >
                          {t.rotulo}
                        </span>
                      ))}
                      {tags.length > 3 && (
                        <span className={cn("px-0.5 text-[10px] leading-4", ehHoje ? "text-white/80" : "text-foreground/50")}>
                          +{tags.length - 3}
                        </span>
                      )}
                    </span>
                  )}
                  {tem && (ehHoje || proximo) && (
                    <span className="mt-auto hidden pt-1 text-[10px] font-bold uppercase tracking-wide sm:block">
                      {ehHoje ? "Vence hoje" : `Em ${diasAte(hoje, d)} ${diasAte(hoje, d) === 1 ? "dia" : "dias"}`}
                    </span>
                  )}
                  {tem && (
                    <span className="mt-auto flex justify-center gap-0.5 pt-1 sm:hidden">
                      {itens.some((i) => i.tipo === "TRIBUTO") && <span className={cn("h-1.5 w-1.5 rounded-full", ehHoje ? "bg-white" : "bg-brand")} />}
                      {itens.some((i) => i.tipo === "DECLARACAO") && <span className="h-1.5 w-1.5 rounded-full bg-success" />}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-foreground/60">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand-soft ring-1 ring-brand/40" />Pagamento</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-success-soft ring-1 ring-success/40" />Declaração</span>
            {mesCorrente && (
              <>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-rose-900" />Hoje ({venceHoje})</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-300 ring-1 ring-amber-500" />Próximos 7 dias ({venceSemana})</span>
              </>
            )}
            {(["diario", "outros"] as const).map((k) =>
              porChave.has(k) ? (
                <button
                  key={k}
                  type="button"
                  onClick={() => setEscolhida(k)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5",
                    selecao === k ? "border-brand bg-brand-soft text-brand" : "border-border hover:bg-surface-muted",
                  )}
                >
                  {k === "diario" ? "Diárias" : "Outros prazos"} ({porChave.get(k)!.length})
                </button>
              ) : null,
            )}
          </div>
        </div>

        {/* ------------------------------------------------ painel do dia */}
        <div className="flex min-h-0 flex-col rounded-xl border border-border bg-surface-muted/40">
          {!info ? (
            <div className="p-5 text-sm text-foreground/60">
              A agenda de {nomeMes(mes)} ainda não foi importada. A Receita publica a agenda do mês seguinte
              por volta do dia 25 — a rotina diária busca sozinha assim que sair.
            </div>
          ) : buscando ? (
            <PainelItens
              titulo={`Resultados para “${busca.trim()}”`}
              subtitulo={`${filtradas.length} ${filtradas.length === 1 ? "obrigação" : "obrigações"}`}
              itens={filtradas}
              mostrarData
            />
          ) : selecao ? (
            <PainelItens
              titulo={
                selecao === "diario" ? "Diárias" : selecao === "outros" ? "Outros prazos" : dataPorExtenso(selecao)
              }
              subtitulo={
                selecao === "diario"
                  ? "Vencem no próprio dia do fato gerador"
                  : `${porChave.get(selecao)!.length} ${porChave.get(selecao)!.length === 1 ? "obrigação" : "obrigações"}` +
                    (selecao === hoje ? " · vence hoje" : selecao > hoje && selecao <= fimSemana ? " · próximos 7 dias" : "")
              }
              itens={porChave.get(selecao)!}
              destaque={selecao === hoje ? "hoje" : selecao > hoje && selecao <= fimSemana ? "semana" : undefined}
            />
          ) : (
            <div className="p-5 text-sm text-foreground/60">Nenhuma obrigação com esse filtro.</div>
          )}
        </div>
      </div>

      <AtualizarAgenda mes={mes} />
    </Card>
  );
}

function PainelItens({
  titulo,
  subtitulo,
  itens,
  mostrarData,
  destaque,
}: {
  titulo: string;
  subtitulo: string;
  itens: AgendaLinha[];
  mostrarData?: boolean;
  destaque?: "hoje" | "semana";
}) {
  return (
    <>
      <div
        className={cn(
          "rounded-t-xl border-b border-border px-4 py-3",
          destaque === "hoje" && "bg-rose-900 text-white",
          destaque === "semana" && "bg-amber-300 text-amber-950",
        )}
      >
        <div className={cn("text-sm font-semibold", destaque ? "" : "text-foreground")}>{titulo}</div>
        <div className={cn("text-xs", destaque ? "opacity-80" : "text-foreground/60")}>{subtitulo}</div>
      </div>
      <ul className="max-h-[440px] divide-y divide-border overflow-y-auto">
        {itens.map((i) => (
          <li key={i.id} className="px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded px-1.5 text-[11px] font-semibold leading-5",
                  i.tipo === "TRIBUTO" ? "bg-brand-soft text-brand" : "bg-success-soft text-success",
                )}
              >
                {rotuloCurto(i)}
              </span>
              {i.codigo && <span className="font-mono text-xs text-foreground">{i.codigo}</span>}
              {i.documento && i.documento !== rotuloCurto(i) && (
                <span className="text-[11px] text-foreground/50">{i.documento}</span>
              )}
              {mostrarData && (
                <span className="ml-auto text-xs text-foreground/50">
                  {i.vencimento ? `${i.vencimento.slice(8, 10)}/${i.vencimento.slice(5, 7)}` : i.dia === 0 ? "Diário" : "Outro prazo"}
                </span>
              )}
            </div>
            <div className="mt-1 text-sm text-foreground/85">{i.descricao}</div>
            <div className="mt-0.5 text-xs text-foreground/55">
              {i.tipo === "DECLARACAO" ? "Referência" : "Apuração"}: {i.periodo ?? "—"}
              {i.tipo === "DECLARACAO" && i.grupo ? ` · ${i.grupo}` : ""}
              {i.dia_texto && i.dia !== 0 ? ` · Prazo: ${i.dia_texto}` : ""}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function AtualizarAgenda({ mes }: { mes: string }) {
  const [estadoReimp, reimportar, reimportando] = useActionState<AgendaActionState, FormData>(reimportarAgendaAction, null);
  const [estadoEnvio, enviar, enviando] = useActionState<AgendaActionState, FormData>(enviarPlanilhaAgendaAction, null);
  const estado = estadoEnvio ?? estadoReimp;
  return (
    <details className="border-t border-border px-5 py-2 text-xs text-foreground/60">
      <summary className="cursor-pointer py-1">Atualizar agenda de {nomeMes(mes)}</summary>
      <div className="flex flex-wrap items-end gap-3 py-2">
        <form action={reimportar}>
          <input type="hidden" name="mes" value={mes} />
          <Button type="submit" variant="secondary" loading={reimportando}>
            Reimportar do site da Receita
          </Button>
        </form>
        <form action={enviar} className="flex items-end gap-2">
          <input type="hidden" name="mes" value={mes} />
          <input type="file" name="arquivo" accept=".xlsx" className="text-xs" />
          <Button type="submit" variant="secondary" loading={enviando}>
            Enviar planilha do ADE
          </Button>
        </form>
      </div>
      {estado?.ok && <Alert tone="success">{estado.ok}</Alert>}
      {estado?.error && <Alert>{estado.error}</Alert>}
    </details>
  );
}
