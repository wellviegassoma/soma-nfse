import { createClient } from "@/lib/supabase/server";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import { hojeBrasilia } from "@/lib/competencia";
import { listarEquipe, nomeEmpresa } from "@/lib/tarefas";
import { rotuloCompetencia, situacaoTarefa, somarMeses, type StatusTarefa } from "@/lib/tarefas-comum";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { competenciaDoParam, SeletorCompetencia } from "../Competencia";

export const metadata = { title: "Produtividade — Painel SOMA" };

type Linha = {
  competencia: string;
  modelo_id: string;
  company_id: string;
  departamento_id: string;
  responsavel_id: string | null;
  concluida_por: string | null;
  status: StatusTarefa;
  prazo_meta: string | null;
  prazo_legal: string | null;
  aguardando_cliente: boolean;
  etapa_atual: number | null;
  concluida_em: string | null;
  created_at: string;
  tarefa_modelos: { nome: string } | null;
  atendimento_departamentos: { nome: string } | null;
  companies: { legal_name: string; trade_name: string | null; codigo_cliente: string | null } | null;
};

/** Data (YYYY-MM-DD) em Brasília de um timestamp. */
function diaBrasilia(ts: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(ts));
}

type Agregado = {
  total: number;
  concluidas: number;
  noPrazoMeta: number;
  aposMeta: number;
  aposLegal: number;
  atrasadas: number;
  risco: number;
  aguardando: number;
  naoSeAplica: number;
  diasSoma: number;
};

function novo(): Agregado {
  return { total: 0, concluidas: 0, noPrazoMeta: 0, aposMeta: 0, aposLegal: 0, atrasadas: 0, risco: 0, aguardando: 0, naoSeAplica: 0, diasSoma: 0 };
}

function somar(a: Agregado, t: Linha, hoje: string) {
  a.total++;
  if (t.status === "NAO_SE_APLICA") {
    a.naoSeAplica++;
    return;
  }
  if (t.status === "CONCLUIDA" && t.concluida_em) {
    a.concluidas++;
    const dia = diaBrasilia(t.concluida_em);
    if (t.prazo_legal && dia > t.prazo_legal) a.aposLegal++;
    else if (t.prazo_meta && dia > t.prazo_meta) a.aposMeta++;
    else a.noPrazoMeta++;
    a.diasSoma += Math.max(0, (new Date(t.concluida_em).getTime() - new Date(t.created_at).getTime()) / 86_400_000);
    return;
  }
  const s = situacaoTarefa(t, hoje);
  if (s === "RISCO") a.risco++;
  else if (s === "ATRASADA") a.atrasadas++;
  else if (s === "AGUARDANDO_CLIENTE") a.aguardando++;
}

function pct(n: number, d: number) {
  return d ? `${Math.round((n / d) * 100)}%` : "—";
}

export default async function ProdutividadePage(props: PageProps<"/admin/tarefas/produtividade">) {
  const sp = await props.searchParams;
  const competencia = competenciaDoParam(sp.competencia);
  const supabase = await createClient();
  const hoje = hojeBrasilia();
  const competencias = [5, 4, 3, 2, 1, 0].map((n) => somarMeses(competencia, -n));

  const [linhas, equipe, { data: etapas }] = await Promise.all([
    buscarTudoPaginado<Linha>((from, to) =>
      supabase
        .from("tarefas")
        .select(
          "competencia, modelo_id, company_id, departamento_id, responsavel_id, concluida_por, status, prazo_meta, prazo_legal, aguardando_cliente, etapa_atual, concluida_em, created_at, tarefa_modelos(nome), atendimento_departamentos(nome), companies(legal_name, trade_name, codigo_cliente)",
        )
        .in("competencia", competencias)
        .order("id")
        .range(from, to) as unknown as PromiseLike<{ data: Linha[] | null; error: { message: string } | null }>,
    ),
    listarEquipe(),
    supabase.from("tarefa_modelo_etapas").select("modelo_id, ordem, nome"),
  ]);
  const nomePessoa = new Map(equipe.map((u) => [u.id, u.nome]));
  const nomeEtapa = new Map((etapas ?? []).map((e) => [`${e.modelo_id}|${e.ordem}`, e.nome as string]));
  const doMes = linhas.filter((t) => t.competencia === competencia);

  // Quem fez: quem concluiu na mão; senão o responsável (conclusão pela central conta para ele).
  const porPessoa = new Map<string, Agregado>();
  const porDepto = new Map<string, Agregado>();
  const geral = novo();
  for (const t of doMes) {
    const pessoa = (t.status === "CONCLUIDA" && t.concluida_por) || t.responsavel_id || "_sem";
    const ap = porPessoa.get(pessoa) ?? novo();
    somar(ap, t, hoje);
    porPessoa.set(pessoa, ap);
    const d = t.atendimento_departamentos?.nome ?? "—";
    const ad = porDepto.get(d) ?? novo();
    somar(ad, t, hoje);
    porDepto.set(d, ad);
    somar(geral, t, hoje);
  }

  // Onde trava: abertas por modelo × etapa atual.
  const travas = new Map<string, number>();
  for (const t of doMes) {
    if (t.status !== "A_FAZER" && t.status !== "EM_ANDAMENTO") continue;
    const etapa = t.etapa_atual != null ? nomeEtapa.get(`${t.modelo_id}|${t.etapa_atual}`) : null;
    const chave = `${t.tarefa_modelos?.nome ?? "—"}${etapa ? ` › ${etapa}` : ""}`;
    travas.set(chave, (travas.get(chave) ?? 0) + 1);
  }
  const listaTravas = [...travas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  // Clientes que seguram (Aguardando cliente, todas as competências do período).
  const clientes = new Map<string, { nome: string; n: number; maisAntiga: string }>();
  for (const t of linhas) {
    if (!t.aguardando_cliente || (t.status !== "A_FAZER" && t.status !== "EM_ANDAMENTO")) continue;
    const c = clientes.get(t.company_id) ?? { nome: t.companies ? nomeEmpresa(t.companies) : "—", n: 0, maisAntiga: t.competencia };
    c.n++;
    if (t.competencia < c.maisAntiga) c.maisAntiga = t.competencia;
    clientes.set(t.company_id, c);
  }
  const listaClientes = [...clientes.values()].sort((a, b) => b.n - a.n || a.maisAntiga.localeCompare(b.maisAntiga)).slice(0, 10);

  // Evolução: % no prazo da meta por competência.
  const evolucao = competencias.map((c) => {
    const a = novo();
    for (const t of linhas) if (t.competencia === c) somar(a, t, hoje);
    return { c, a };
  });

  const linhasPessoa = [...porPessoa.entries()]
    .map(([id, a]) => ({ nome: id === "_sem" ? "Sem responsável" : nomePessoa.get(id) ?? "—", a }))
    .sort((x, y) => y.a.total - x.a.total);
  const linhasDepto = [...porDepto.entries()].map(([nome, a]) => ({ nome, a })).sort((x, y) => y.a.total - x.a.total);

  return (
    <div className="flex flex-col gap-5">
      <SeletorCompetencia competencia={competencia} base="/admin/tarefas/produtividade" />

      {doMes.length === 0 ? (
        <Card className="p-6 text-sm text-foreground/60">Nenhuma tarefa nessa competência.</Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Indicador rotulo="Tarefas" valor={String(geral.total)} />
            <Indicador rotulo="Concluídas" valor={`${geral.concluidas}`} sub={pct(geral.concluidas, geral.total - geral.naoSeAplica)} />
            <Indicador rotulo="No prazo da meta" valor={pct(geral.noPrazoMeta, geral.concluidas)} sub={`${geral.noPrazoMeta} de ${geral.concluidas}`} />
            <Indicador rotulo="Atrasadas" valor={String(geral.atrasadas)} tom="ambar" />
            <Indicador rotulo="Risco de multa" valor={String(geral.risco)} tom="vinho" />
            <Indicador rotulo="Aguardando cliente" valor={String(geral.aguardando)} tom="azul" />
          </div>

          <TabelaAgregado titulo="Por pessoa" linhas={linhasPessoa} />
          <TabelaAgregado titulo="Por departamento" linhas={linhasDepto} />

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h2 className="mb-2 text-sm font-semibold">Onde a rotina trava (abertas por etapa)</h2>
              {listaTravas.length ? (
                <ul className="flex flex-col gap-1 text-sm">
                  {listaTravas.map(([nome, n]) => (
                    <li key={nome} className="flex items-center gap-2">
                      <span className="flex-1 truncate text-foreground/80" title={nome}>
                        {nome}
                      </span>
                      <Barra valor={n} max={listaTravas[0][1]} />
                      <span className="w-10 text-right font-semibold">{n}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-foreground/60">Nada aberto.</p>
              )}
            </Card>
            <Card className="p-4">
              <h2 className="mb-2 text-sm font-semibold">Clientes que mais seguram (aguardando cliente)</h2>
              {listaClientes.length ? (
                <ul className="flex flex-col gap-1 text-sm">
                  {listaClientes.map((c) => (
                    <li key={c.nome} className="flex items-center gap-2">
                      <span className="flex-1 truncate text-foreground/80">{c.nome}</span>
                      <span className="text-xs text-foreground/50">desde {rotuloCompetencia(c.maisAntiga)}</span>
                      <span className="w-8 text-right font-semibold">{c.n}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-foreground/60">Nenhum cliente segurando tarefa.</p>
              )}
            </Card>
          </div>

          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold">Evolução — % concluídas no prazo da meta</h2>
            <div className="flex items-end gap-3">
              {evolucao.map(({ c, a }) => {
                const v = a.concluidas ? a.noPrazoMeta / a.concluidas : 0;
                return (
                  <div key={c} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-xs font-semibold">{a.concluidas ? pct(a.noPrazoMeta, a.concluidas) : "—"}</span>
                    <div className="flex h-28 w-full max-w-[56px] items-end rounded bg-surface-muted">
                      <div className={cn("w-full rounded", c === competencia ? "bg-brand" : "bg-brand/40")} style={{ height: `${Math.round(v * 100)}%` }} />
                    </div>
                    <span className="text-xs text-foreground/60">{rotuloCompetencia(c)}</span>
                    <span className="text-[10px] text-foreground/40">{a.total} tarefas</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Indicador({ rotulo, valor, sub, tom }: { rotulo: string; valor: string; sub?: string; tom?: "ambar" | "vinho" | "azul" }) {
  return (
    <Card
      className={cn(
        "p-3",
        tom === "vinho" ? "border-rose-900/40" : tom === "ambar" ? "border-amber-400/60" : tom === "azul" ? "border-sky-300" : "",
      )}
    >
      <div className="text-xs text-foreground/60">{rotulo}</div>
      <div className={cn("text-xl font-semibold", tom === "vinho" ? "text-rose-900" : tom === "ambar" ? "text-amber-700" : tom === "azul" ? "text-sky-800" : "text-foreground")}>
        {valor}
      </div>
      {sub && <div className="text-xs text-foreground/50">{sub}</div>}
    </Card>
  );
}

function Barra({ valor, max }: { valor: number; max: number }) {
  return (
    <div className="h-2 w-24 rounded bg-surface-muted">
      <div className="h-2 rounded bg-brand/70" style={{ width: `${max ? Math.round((valor / max) * 100) : 0}%` }} />
    </div>
  );
}

function TabelaAgregado({ titulo, linhas }: { titulo: string; linhas: { nome: string; a: Agregado }[] }) {
  return (
    <Card className="overflow-x-auto">
      <div className="border-b border-border px-4 py-2 text-sm font-semibold">{titulo}</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-foreground/50">
            <th className="px-4 py-2 font-medium">Nome</th>
            <th className="px-2 py-2 text-right font-medium">Tarefas</th>
            <th className="px-2 py-2 text-right font-medium">Concluídas</th>
            <th className="px-2 py-2 text-right font-medium">No prazo da meta</th>
            <th className="px-2 py-2 text-right font-medium">Após a meta</th>
            <th className="px-2 py-2 text-right font-medium">Após prazo legal</th>
            <th className="px-2 py-2 text-right font-medium">Atrasadas</th>
            <th className="px-2 py-2 text-right font-medium">Risco</th>
            <th className="px-2 py-2 text-right font-medium">Aguard. cliente</th>
            <th className="px-4 py-2 text-right font-medium">Dias até concluir</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(({ nome, a }) => (
            <tr key={nome} className="border-b border-border/60">
              <td className="px-4 py-2">{nome}</td>
              <td className="px-2 py-2 text-right">{a.total}</td>
              <td className="px-2 py-2 text-right">{a.concluidas}</td>
              <td className="px-2 py-2 text-right font-semibold">{pct(a.noPrazoMeta, a.concluidas)}</td>
              <td className="px-2 py-2 text-right">{a.aposMeta || ""}</td>
              <td className="px-2 py-2 text-right text-rose-800">{a.aposLegal || ""}</td>
              <td className="px-2 py-2 text-right text-amber-700">{a.atrasadas || ""}</td>
              <td className="px-2 py-2 text-right font-semibold text-rose-900">{a.risco || ""}</td>
              <td className="px-2 py-2 text-right text-sky-800">{a.aguardando || ""}</td>
              <td className="px-4 py-2 text-right">{a.concluidas ? (a.diasSoma / a.concluidas).toFixed(1) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
