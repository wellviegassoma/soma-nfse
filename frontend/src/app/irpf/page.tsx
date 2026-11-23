import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { formatarMoeda } from "@/lib/formatters";
import { STATUS_LABEL, dataBr, exercicioAtual } from "@/lib/irpf/comum";
import { DIAS_CLIENTE, DIAS_PARADA, montarPainel, type ItemFila } from "@/lib/irpf/painel";
import { AbrirExercicioButton } from "./declaracoes/AbrirExercicioButton";

export const metadata = { title: "IRPF — Painel" };

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

function Kpi({
  titulo,
  valor,
  sub,
  tom,
  barra,
  href,
}: {
  titulo: string;
  valor: React.ReactNode;
  sub?: React.ReactNode;
  tom?: "danger" | "success" | "warning";
  barra?: number;
  href?: string;
}) {
  const corpo = (
    <Card
      className={cn(
        "h-full p-4 transition-shadow",
        href && "hover:shadow-md",
        tom === "danger" && "border-danger/40 bg-danger-soft/40",
        tom === "warning" && "border-warning/40 bg-warning-soft/40",
      )}
    >
      <div className="text-xs text-foreground/55">{titulo}</div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold text-foreground",
          tom === "danger" && "text-danger",
          tom === "success" && "text-success",
          tom === "warning" && "text-warning",
        )}
      >
        {valor}
      </div>
      {barra !== undefined && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, barra)}%` }} />
        </div>
      )}
      {sub && <div className="mt-1.5 text-xs text-foreground/55">{sub}</div>}
    </Card>
  );
  return href ? <Link href={href}>{corpo}</Link> : corpo;
}

function Fila({
  titulo,
  ajuda,
  itens,
  verTodas,
  tom,
  rotuloDias = "parada há",
}: {
  titulo: string;
  ajuda: string;
  itens: ItemFila[];
  verTodas: string;
  tom?: "danger" | "warning" | "success";
  rotuloDias?: string;
}) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-foreground">{titulo}</div>
          <div className="text-[11px] text-foreground/50">{ajuda}</div>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-sm font-semibold",
            itens.length === 0
              ? "bg-surface-muted text-foreground/40"
              : tom === "danger"
                ? "bg-danger-soft text-danger"
                : tom === "success"
                  ? "bg-success-soft text-success"
                  : "bg-warning-soft text-warning",
          )}
        >
          {itens.length}
        </span>
      </div>
      <ul className="flex-1 divide-y divide-border text-sm">
        {itens.slice(0, 6).map((i) => (
          <li key={i.id}>
            <Link href={`/irpf/declaracoes/${i.id}`} className="flex items-center justify-between gap-2 px-4 py-2 hover:bg-surface-muted">
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">{i.nome}</span>
                <span className="text-[11px] text-foreground/45">
                  {i.responsavel}
                  {i.detalhe ? ` · ${i.detalhe}` : ""}
                </span>
              </span>
              <span className={cn("shrink-0 text-xs", i.dias >= DIAS_PARADA ? "font-semibold text-danger" : "text-foreground/50")}>
                {i.dias === 0 ? "hoje" : `${rotuloDias} ${i.dias}d`}
              </span>
            </Link>
          </li>
        ))}
        {itens.length === 0 && <li className="px-4 py-4 text-center text-xs text-foreground/40">Nada aqui.</li>}
      </ul>
      {itens.length > 6 && (
        <Link href={verTodas} className="border-t border-border px-4 py-2 text-center text-xs text-brand hover:underline">
          Ver todas ({itens.length})
        </Link>
      )}
    </Card>
  );
}

export default async function PainelIrpfPage(props: PageProps<"/irpf">) {
  const sp = await props.searchParams;
  const supabase = await createClient();

  // Exercício padrão: o em preparação se já tiver declarações abertas; senão o anterior.
  const atual = exercicioAtual();
  const exs = await buscarTudoPaginado<{ exercicio: number }>((from, to) =>
    supabase.from("irpf_declaracoes").select("exercicio").order("id").range(from, to),
  );
  const contagem = new Map<number, number>();
  for (const e of exs) contagem.set(e.exercicio, (contagem.get(e.exercicio) ?? 0) + 1);
  const exercicios = [...new Set([atual, ...contagem.keys()])].sort((a, b) => b - a);
  const padrao = (contagem.get(atual) ?? 0) >= (contagem.get(atual - 1) ?? 0) / 2 ? atual : atual - 1;
  const exercicio = Number(typeof sp.ex === "string" ? sp.ex : "") || padrao;

  const p = await montarPainel(supabase, exercicio);
  const lista = (extra: Record<string, string>) =>
    `/irpf/declaracoes?${new URLSearchParams({ ex: String(exercicio), visao: "lista", ...extra }).toString()}`;
  const quadro = `/irpf/declaracoes?ex=${exercicio}&visao=quadro`;

  const ritmoAtualDia = p.ultimos7 / 5;
  const atrasado = p.ritmoNecessario !== null && p.abertas > 0 && ritmoAtualDia < p.ritmoNecessario;
  const maxEtapa = Math.max(1, ...p.porEtapa.map((e) => e.n));
  const maxSemana = Math.max(1, ...p.semanas.map((s) => s.n));
  const exercicioNaoAberto = exercicio === atual && p.semDeclaracao > 0 && p.semDeclaracao >= p.ativos / 2;

  return (
    <div className="flex flex-col gap-5">
      {/* Cabeçalho + atalhos */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Painel — IRPF {exercicio}</h1>
          <p className="text-sm text-foreground/60">
            Ano-calendário {exercicio - 1} · prazo da Receita {dataBr(p.prazo)}
          </p>
        </div>
        <form className="flex items-center gap-2">
          <Select name="ex" defaultValue={String(exercicio)} className="h-10 w-36">
            {exercicios.map((e) => (
              <option key={e} value={e}>
                Exercício {e}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            Ver
          </Button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          ["Importar .DEC / PDF", "/irpf/importar"],
          ["Quadro (Kanban)", quadro],
          ["Lista de declarações", lista({})],
          ["Financeiro", `/irpf/financeiro?ex=${exercicio}`],
          ["Contribuintes", "/irpf/contribuintes"],
          ["Exportar Excel", `/api/irpf/planilha/declaracoes?ex=${exercicio}`],
        ].map(([rotulo, href]) =>
          href.startsWith("/api/") ? (
            <a
              key={href}
              href={href}
              className="inline-flex h-9 items-center rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground hover:bg-surface-muted"
            >
              {rotulo}
            </a>
          ) : (
            <Link
              key={href}
              href={href}
              className="inline-flex h-9 items-center rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground hover:bg-surface-muted"
            >
              {rotulo}
            </Link>
          ),
        )}
        {exercicio >= atual && p.semDeclaracao > 0 && <AbrirExercicioButton exercicio={exercicio} faltam={p.semDeclaracao} />}
      </div>

      {exercicioNaoAberto && (
        <Card className="border-brand/30 bg-brand/5 p-4 text-sm text-foreground/80">
          <b>Temporada {exercicio} ainda não aberta.</b> {p.semDeclaracao} contribuinte(s) ativo(s) ainda sem declaração{" "}
          {exercicio}
          {p.doAnoPassadoSemAgora > 0 && ` (${p.doAnoPassadoSemAgora} fizeram em ${exercicio - 1})`}. Use “Abrir exercício” para
          criar todas de uma vez, já com o checklist de documentos sugerido pelo ano anterior.
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          titulo={`Declarações ${exercicio}`}
          valor={p.total}
          href={lista({})}
          sub={
            <>
              {p.ativos} contribuintes ativos
              {p.semDeclaracao > 0 && <> · <span className="text-brand">{p.semDeclaracao} sem declaração</span></>}
              {p.naoFara > 0 && ` · ${p.naoFara} não fará`}
            </>
          }
        />
        <Kpi
          titulo="Transmitidas"
          valor={
            <>
              {p.transmitidas} <span className="text-sm font-normal text-foreground/50">({pct(p.transmitidas, p.total)}%)</span>
            </>
          }
          barra={pct(p.transmitidas, p.total)}
          href={lista({ status: "TRANSMITIDA" })}
          sub={
            p.anteriorTotal > 0
              ? `Ano passado nesta data: ${p.anteriorAteHoje} de ${p.anteriorTotal} (${pct(p.anteriorAteHoje, p.anteriorTotal)}%)`
              : undefined
          }
        />
        <Kpi
          titulo="Prazo da Receita"
          valor={p.diasCorridos >= 0 ? `${p.diasCorridos} dias` : "Encerrado"}
          tom={atrasado && p.diasCorridos <= 60 ? "warning" : undefined}
          sub={
            p.diasCorridos >= 0 ? (
              <>
                {p.abertas} a entregar · {p.diasUteis} dias úteis
                {p.ritmoNecessario !== null && p.abertas > 0 && (
                  <>
                    <br />
                    Ritmo: <b>{p.ritmoNecessario < 0.1 ? "menos de 0,1" : p.ritmoNecessario.toFixed(1).replace(".", ",")}/dia útil</b> · últimos 7 dias: {p.ultimos7}
                  </>
                )}
              </>
            ) : (
              `${p.abertas} sem transmitir`
            )
          }
        />
        <Kpi
          titulo={`Paradas há +${DIAS_PARADA} dias`}
          valor={p.paradas}
          tom={p.paradas > 0 ? "danger" : "success"}
          sub={`${p.filas.cobrarCliente.length} esperando o cliente há +${DIAS_CLIENTE} dias`}
        />
      </div>

      {/* O que fazer agora */}
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foreground/50">O que fazer agora</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Fila
            titulo="Prontas para transmitir"
            ajuda="Cliente aprovou — falta entregar"
            itens={p.filas.transmitir}
            verTodas={lista({ status: "APROVADA" })}
            tom="success"
            rotuloDias="há"
          />
          <Fila titulo="Para revisar" ajuda="Esperando o revisor" itens={p.filas.revisar} verTodas={lista({ status: "EM_REVISAO" })} />
          <Fila
            titulo="Documentos recebidos"
            ajuda="Já dá para começar"
            itens={p.filas.comecar}
            verTodas={lista({ status: "DOCUMENTOS_RECEBIDOS" })}
            rotuloDias="há"
          />
          <Fila
            titulo="Cobrar o cliente"
            ajuda={`Documentos ou aprovação há +${DIAS_CLIENTE} dias`}
            itens={p.filas.cobrarCliente}
            verTodas={lista({ status: "AGUARDANDO_DOCUMENTOS" })}
            tom="danger"
            rotuloDias="há"
          />
          <Fila
            titulo="Honorário vencido"
            ajuda="Passou do vencimento e não pagou"
            itens={p.filas.honorarioVencido}
            verTodas={`/irpf/financeiro?ex=${exercicio}`}
            tom="danger"
            rotuloDias="há"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1fr]">
        {/* Funil */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-foreground">Declarações por etapa</div>
            <Link href={quadro} className="text-xs text-brand hover:underline">
              Abrir quadro →
            </Link>
          </div>
          <div className="flex flex-col gap-1.5">
            {p.porEtapa.map((e) => (
              <Link
                key={e.status}
                href={lista({ status: e.status })}
                className="grid grid-cols-[15.5rem_1fr_2rem] items-center gap-3 rounded px-1 py-0.5 text-sm hover:bg-surface-muted"
              >
                <span className="truncate text-foreground/75">{STATUS_LABEL[e.status]}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-surface-muted">
                  <span
                    className={cn("block h-full rounded-full", e.status === "TRANSMITIDA" ? "bg-success" : "bg-brand")}
                    style={{ width: `${(e.n / maxEtapa) * 100}%` }}
                  />
                </span>
                <span className="text-right font-medium tabular-nums">{e.n}</span>
              </Link>
            ))}
          </div>
        </Card>

        <div className="flex flex-col gap-3">
          {/* Honorários */}
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-foreground">Honorários {exercicio}</div>
              <Link href={`/irpf/financeiro?ex=${exercicio}`} className="text-xs text-brand hover:underline">
                Financeiro →
              </Link>
            </div>
            <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
              <dt className="text-foreground/65">Previsto</dt>
              <dd className="text-right font-medium tabular-nums">{formatarMoeda(p.honorarios.previsto)}</dd>
              <dt className="text-foreground/65">Recebido</dt>
              <dd className="text-right font-medium tabular-nums text-success">{formatarMoeda(p.honorarios.recebido)}</dd>
              <dt className="font-semibold">A receber</dt>
              <dd className="text-right font-semibold tabular-nums">{formatarMoeda(p.honorarios.aReceber)}</dd>
              {p.honorarios.vencido > 0 && (
                <>
                  <dt className="text-danger">Vencido</dt>
                  <dd className="text-right tabular-nums text-danger">{formatarMoeda(p.honorarios.vencido)}</dd>
                </>
              )}
            </dl>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full rounded-full bg-success" style={{ width: `${pct(p.honorarios.recebido, p.honorarios.previsto)}%` }} />
            </div>
            <div className="mt-1.5 text-xs text-foreground/55">
              {pct(p.honorarios.recebido, p.honorarios.previsto)}% recebido
              {p.honorarios.entregueSemPagarN > 0 && (
                <>
                  {" "}
                  · <b>{p.honorarios.entregueSemPagarN}</b> entregue(s) sem pagar ({formatarMoeda(p.honorarios.entregueSemPagar)})
                </>
              )}
              {p.honorarios.semValor > 0 && <> · {p.honorarios.semValor} sem valor definido</>}
            </div>
          </Card>

          {/* Carteira dos clientes */}
          <Card className="p-4">
            <div className="mb-3 text-sm font-semibold text-foreground">Resultado dos clientes</div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Link href={lista({})} className="rounded-lg bg-success-soft/60 p-3 hover:shadow-sm">
                <div className="text-xs text-foreground/60">A restituir</div>
                <div className="font-semibold text-success">{formatarMoeda(p.carteira.restituirTotal)}</div>
                <div className="text-[11px] text-foreground/50">{p.carteira.restituirN} cliente(s)</div>
              </Link>
              <Link href={lista({})} className="rounded-lg bg-danger-soft/60 p-3 hover:shadow-sm">
                <div className="text-xs text-foreground/60">A pagar</div>
                <div className="font-semibold text-danger">{formatarMoeda(p.carteira.pagarTotal)}</div>
                <div className="text-[11px] text-foreground/50">
                  {p.carteira.pagarN} cliente(s) · {p.carteira.parceladas} parcelado(s)
                </div>
              </Link>
            </div>
            <div className="mt-2 text-xs text-foreground/50">
              {p.carteira.semSaldo} sem saldo{p.carteira.semArquivo > 0 && ` · ${p.carteira.semArquivo} ainda sem arquivo da declaração`}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1fr]">
        {/* Por responsável */}
        <Card className="overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">Carga por responsável</div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-foreground/50">
              <tr>
                <th className="px-4 py-2 font-medium">Responsável</th>
                <th className="px-2 py-2 text-right font-medium">Total</th>
                <th className="px-2 py-2 text-right font-medium">A fazer</th>
                <th className="px-2 py-2 text-right font-medium">Entregues</th>
                <th className="px-2 py-2 text-right font-medium">Paradas</th>
                <th className="px-4 py-2 text-right font-medium">Honorário a receber</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {p.porResponsavel.map((r) => (
                <tr key={r.nome} className="hover:bg-surface-muted">
                  <td className="px-4 py-2 font-medium">
                    <Link
                      href={lista(r.responsavelId ? { resp: r.responsavelId } : { resp: "sem" })}
                      className="hover:text-brand"
                    >
                      {r.nome}
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.total}</td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">{r.abertas}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-success">
                    {r.transmitidas} <span className="text-xs text-foreground/40">({pct(r.transmitidas, r.total)}%)</span>
                  </td>
                  <td className={cn("px-2 py-2 text-right tabular-nums", r.paradas > 0 && "font-semibold text-danger")}>{r.paradas || "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatarMoeda(r.aReceber)}</td>
                </tr>
              ))}
              {p.porResponsavel.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-center text-xs text-foreground/40">
                    Nenhuma declaração neste exercício.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        {/* Entregas por semana */}
        <Card className="p-4">
          <div className="mb-1 text-sm font-semibold text-foreground">Entregas por semana</div>
          <div className="mb-3 text-xs text-foreground/50">Últimas 10 semanas · {p.ultimos7} nos últimos 7 dias</div>
          <div className="flex h-32 items-end gap-1.5">
            {p.semanas.map((s) => (
              <div key={s.semana} className="flex flex-1 flex-col items-center gap-1" title={`Semana de ${dataBr(s.semana)}: ${s.n}`}>
                <span className="text-[10px] tabular-nums text-foreground/55">{s.n || ""}</span>
                <div className="w-full rounded-t bg-brand/80" style={{ height: `${(s.n / maxSemana) * 96}px`, minHeight: s.n ? 4 : 1 }} />
                <span className="text-[9px] text-foreground/40">{dataBr(s.semana).slice(0, 5)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
