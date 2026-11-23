import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import { listarEquipe } from "@/lib/tarefas";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { STATUS_PILL_CLASSES, formatarCpf, formatarMoeda } from "@/lib/formatters";
import {
  HONORARIO_LABEL,
  STATUS_DECLARACAO,
  STATUS_LABEL,
  STATUS_TOM,
  exercicioAtual,
  prazoEntrega,
  diasAte,
  type HonorarioStatus,
  type StatusDeclaracao,
} from "@/lib/irpf/comum";
import { AbrirExercicioButton } from "./AbrirExercicioButton";
import { QuadroDeclaracoes } from "./QuadroDeclaracoes";

export const metadata = { title: "IRPF — Declarações" };

type Linha = {
  id: string;
  status: StatusDeclaracao;
  responsavel_id: string | null;
  completa: boolean | null;
  retificadora: boolean;
  resultado: "SEM_SALDO" | "PAGAR" | "RESTITUIR" | null;
  imposto_pagar: number | null;
  imposto_restituir: number | null;
  honorario_valor: number | null;
  honorario_status: HonorarioStatus;
  irpf_contribuintes: { id: string; nome: string; cpf: string } | null;
};

export default async function IrpfPage(props: PageProps<"/irpf">) {
  const sp = await props.searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const supabase = await createClient();

  const { data: exs } = await supabase.from("irpf_declaracoes").select("exercicio").order("exercicio", { ascending: false }).limit(1000);
  const exercicios = [...new Set([exercicioAtual(), ...(exs ?? []).map((e) => e.exercicio as number)])].sort((a, b) => b - a);
  // Sem filtro: o exercício mais recente que já tem declaração (o próximo
  // aparece no seletor, com o botão de abrir).
  const exercicio = Number(str("ex")) || ((exs ?? [])[0]?.exercicio as number | undefined) || exercicioAtual();
  const filtroStatus = str("status");
  const filtroResp = str("resp");
  const q = str("q").toLowerCase();
  const visao = str("visao") === "lista" ? "lista" : "quadro";

  const [linhas, equipe, { count: ativos }] = await Promise.all([
    buscarTudoPaginado<Linha>((from, to) =>
      supabase
        .from("irpf_declaracoes")
        .select(
          "id, status, responsavel_id, completa, retificadora, resultado, imposto_pagar, imposto_restituir, honorario_valor, honorario_status, irpf_contribuintes(id, nome, cpf)",
        )
        .eq("exercicio", exercicio)
        .order("id")
        .range(from, to) as unknown as PromiseLike<{ data: Linha[] | null; error: { message: string } | null }>,
    ),
    listarEquipe(),
    supabase.from("irpf_contribuintes").select("id", { count: "exact", head: true }).eq("ativo", true),
  ]);
  const nomeEquipe = new Map(equipe.map((e) => [e.id, e.nome]));

  const ids = linhas.map((l) => l.id);
  const itens = ids.length
    ? await buscarTudoPaginado<{ declaracao_id: string; status: string }>((from, to) =>
        supabase
          .from("irpf_checklist_itens")
          .select("declaracao_id, status")
          .in("declaracao_id", ids)
          .order("id")
          .range(from, to),
      )
    : [];
  const docs = ids.length
    ? await buscarTudoPaginado<{ declaracao_id: string }>((from, to) =>
        supabase
          .from("irpf_arquivos")
          .select("declaracao_id")
          .eq("tipo", "DOCUMENTO")
          .in("declaracao_id", ids)
          .order("id")
          .range(from, to),
      )
    : [];
  const arquivosPorDecl = new Map<string, number>();
  for (const a of docs) arquivosPorDecl.set(a.declaracao_id, (arquivosPorDecl.get(a.declaracao_id) ?? 0) + 1);
  const checklist = new Map<string, { ok: number; total: number }>();
  for (const it of itens) {
    const c = checklist.get(it.declaracao_id) ?? { ok: 0, total: 0 };
    if (it.status !== "NAO_SE_APLICA") c.total++;
    if (it.status === "RECEBIDO") c.ok++;
    checklist.set(it.declaracao_id, c);
  }

  const porStatus = new Map<StatusDeclaracao, number>();
  for (const l of linhas) porStatus.set(l.status, (porStatus.get(l.status) ?? 0) + 1);

  const filtradas = linhas
    .filter((l) => visao === "quadro" || !filtroStatus || l.status === filtroStatus)
    .filter((l) => !filtroResp || (filtroResp === "sem" ? !l.responsavel_id : l.responsavel_id === filtroResp))
    .filter((l) => {
      if (!q) return true;
      const dig = q.replace(/\D/g, "");
      return (l.irpf_contribuintes?.nome ?? "").toLowerCase().includes(q) || (dig.length >= 3 && (l.irpf_contribuintes?.cpf ?? "").includes(dig));
    })
    .sort((a, b) => (a.irpf_contribuintes?.nome ?? "").localeCompare(b.irpf_contribuintes?.nome ?? ""));

  const transmitidas = porStatus.get("TRANSMITIDA") ?? 0;
  const naoFara = porStatus.get("NAO_FARA") ?? 0;
  const totalAtivas = linhas.length - naoFara;
  const prazo = prazoEntrega(exercicio);
  const diasPrazo = diasAte(prazo);
  const faltamAbrir = Math.max(0, (ativos ?? 0) - linhas.length);
  const totalHonorario = linhas.reduce((s, l) => s + Number(l.honorario_valor ?? 0), 0);
  const honorarioPago = linhas
    .filter((l) => l.honorario_status === "PAGO")
    .reduce((s, l) => s + Number(l.honorario_valor ?? 0), 0);

  const urlCom = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ex: String(exercicio), visao, ...(filtroResp ? { resp: filtroResp } : {}), ...extra });
    return `/irpf?${p.toString()}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Declarações {exercicio}</h1>
          <p className="text-sm text-foreground/60">
            Ano-calendário {exercicio - 1} · prazo de entrega {prazo.split("-").reverse().join("/")}
            {diasPrazo >= 0 ? ` (faltam ${diasPrazo} dias)` : " (encerrado)"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form className="flex items-center gap-2">
            <Select name="ex" defaultValue={String(exercicio)} className="h-10 w-32">
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
          {faltamAbrir > 0 && <AbrirExercicioButton exercicio={exercicio} faltam={faltamAbrir} />}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Declarações</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{totalAtivas}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Transmitidas</div>
          <div className="mt-1 text-lg font-semibold text-success">
            {transmitidas}
            {totalAtivas > 0 && (
              <span className="ml-1 text-sm font-normal text-foreground/50">
                ({Math.round((transmitidas / totalAtivas) * 100)}%)
              </span>
            )}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Aguardando o cliente</div>
          <div className="mt-1 text-lg font-semibold text-warning">
            {(porStatus.get("AGUARDANDO_DOCUMENTOS") ?? 0) + (porStatus.get("AGUARDANDO_APROVACAO") ?? 0)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Honorários (pago / total)</div>
          <div className="mt-1 text-lg font-semibold text-foreground">
            {formatarMoeda(honorarioPago)} <span className="text-sm font-normal text-foreground/50">/ {formatarMoeda(totalHonorario)}</span>
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-2 flex overflow-hidden rounded-lg border border-border text-xs font-medium">
          {(["quadro", "lista"] as const).map((v) => (
            <Link
              key={v}
              href={urlCom({ visao: v })}
              className={cn("px-3 py-1.5", visao === v ? "bg-brand text-brand-foreground" : "text-foreground/60 hover:bg-surface-muted")}
            >
              {v === "quadro" ? "Quadro" : "Lista"}
            </Link>
          ))}
        </div>
        {visao === "lista" && (
        <>
        <Link
          href={urlCom({})}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium",
            !filtroStatus ? "border-brand bg-brand/10 text-brand" : "border-border text-foreground/60 hover:text-foreground",
          )}
        >
          Todas ({linhas.length})
        </Link>
        {STATUS_DECLARACAO.filter((s) => porStatus.get(s)).map((s) => (
          <Link
            key={s}
            href={urlCom({ status: s })}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              filtroStatus === s ? "border-brand bg-brand/10 text-brand" : "border-border text-foreground/60 hover:text-foreground",
            )}
          >
            {STATUS_LABEL[s]} ({porStatus.get(s)})
          </Link>
        ))}
        </>
        )}
      </div>

      <Card className="overflow-hidden">
        <form className="flex flex-col gap-2 border-b border-border px-5 py-3 sm:flex-row sm:items-center">
          <input type="hidden" name="ex" value={exercicio} />
          <input type="hidden" name="visao" value={visao} />
          {visao === "lista" && filtroStatus && <input type="hidden" name="status" value={filtroStatus} />}
          <Input name="q" defaultValue={str("q")} placeholder="Buscar por nome ou CPF..." className="h-10 sm:w-64" />
          <Select name="resp" defaultValue={filtroResp} className="h-10 sm:w-56">
            <option value="">Todos os responsáveis</option>
            <option value="sem">Sem responsável</option>
            {equipe.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
        </form>

        {linhas.length === 0 ? (
          <div className="p-8 text-center text-sm text-foreground/50">
            Nenhuma declaração em {exercicio}.{" "}
            <Link href="/irpf/importar" className="text-brand underline">
              Importe os arquivos .DEC
            </Link>{" "}
            {faltamAbrir > 0 ? "ou abra o exercício para os contribuintes cadastrados." : "para começar."}
          </div>
        ) : visao === "quadro" ? (
          <div className="p-3">
            <QuadroDeclaracoes
              cartoes={filtradas.map((l) => {
                const c = checklist.get(l.id);
                return {
                  id: l.id,
                  nome: l.irpf_contribuintes?.nome ?? "—",
                  cpf: l.irpf_contribuintes?.cpf ?? "",
                  status: l.status,
                  responsavel: l.responsavel_id ? nomeEquipe.get(l.responsavel_id) ?? null : null,
                  docsOk: c?.ok ?? 0,
                  docsTotal: c?.total ?? 0,
                  arquivos: arquivosPorDecl.get(l.id) ?? 0,
                  resultado:
                    l.resultado === "PAGAR"
                      ? `Pagar ${formatarMoeda(Number(l.imposto_pagar ?? 0))}`
                      : l.resultado === "RESTITUIR"
                        ? `Restituir ${formatarMoeda(Number(l.imposto_restituir ?? 0))}`
                        : null,
                  resultadoTom: l.resultado === "PAGAR" ? "danger" : l.resultado === "RESTITUIR" ? "success" : null,
                };
              })}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-left text-xs text-foreground/55">
                <tr>
                  <th className="px-5 py-2 font-medium">Contribuinte</th>
                  <th className="px-3 py-2 font-medium">Situação</th>
                  <th className="px-3 py-2 font-medium">Responsável</th>
                  <th className="px-3 py-2 font-medium">Documentos</th>
                  <th className="px-3 py-2 font-medium">Resultado</th>
                  <th className="px-3 py-2 font-medium">Honorário</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtradas.map((l) => {
                  const c = checklist.get(l.id);
                  return (
                    <tr key={l.id} className="hover:bg-surface-muted">
                      <td className="px-5 py-2.5">
                        <Link href={`/irpf/declaracoes/${l.id}`} className="font-medium text-foreground hover:text-brand">
                          {l.irpf_contribuintes?.nome ?? "—"}
                        </Link>
                        <div className="text-xs text-foreground/45">
                          CPF {formatarCpf(l.irpf_contribuintes?.cpf)} ·{" "}
                          {l.completa === null ? "sem arquivo" : l.completa ? "Completa" : "Simplificada"}
                          {l.retificadora ? " · retificadora" : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn("rounded-full px-2 py-1 text-xs font-medium", STATUS_PILL_CLASSES[STATUS_TOM[l.status]])}>
                          {STATUS_LABEL[l.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-foreground/70">
                        {l.responsavel_id ? nomeEquipe.get(l.responsavel_id) ?? "—" : <span className="text-foreground/40">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-foreground/70">{c && c.total ? `${c.ok}/${c.total}` : "—"}</td>
                      <td className="px-3 py-2.5">
                        {l.resultado === "PAGAR" ? (
                          <span className="text-danger">Pagar {formatarMoeda(Number(l.imposto_pagar ?? 0))}</span>
                        ) : l.resultado === "RESTITUIR" ? (
                          <span className="text-success">Restituir {formatarMoeda(Number(l.imposto_restituir ?? 0))}</span>
                        ) : l.resultado === "SEM_SALDO" ? (
                          <span className="text-foreground/50">Sem saldo</span>
                        ) : (
                          <span className="text-foreground/40">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-foreground/70">
                        {l.honorario_valor !== null ? formatarMoeda(Number(l.honorario_valor)) : "—"}
                        <div className="text-xs text-foreground/45">{HONORARIO_LABEL[l.honorario_status]}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
