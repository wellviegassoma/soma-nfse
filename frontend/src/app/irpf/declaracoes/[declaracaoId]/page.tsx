import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listarEquipe } from "@/lib/tarefas";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { STATUS_PILL_CLASSES, formatarMoeda, formatarDataHora } from "@/lib/formatters";
import {
  HONORARIO_LABEL,
  STATUS_LABEL,
  STATUS_TOM,
  alertaVariacaoPatrimonial,
  descricaoPagamento,
  linhasComparativo,
  resumirTexto,
  type ChecklistStatus,
  type HonorarioStatus,
  type ResumoGravado,
  type SituacaoReceita as SituacaoReceitaTipo,
  SITUACAO_RECEITA_LABEL,
  type StatusDeclaracao,
} from "@/lib/irpf/comum";
import { ControleDeclaracao } from "./ControleDeclaracao";
import { SituacaoReceita } from "./SituacaoReceita";
import { ChecklistDeclaracao } from "./ChecklistDeclaracao";
import { ArquivosDeclaracao } from "./ArquivosDeclaracao";

export const metadata = { title: "IRPF — Declaração" };

function Valor({ v, tom }: { v: number; tom?: "danger" | "success" }) {
  return <span className={cn(tom === "danger" && "text-danger", tom === "success" && "text-success")}>{formatarMoeda(v)}</span>;
}

function variacao(anterior: number | null, atual: number) {
  if (anterior === null) return null;
  if (anterior === 0) return atual === 0 ? "0%" : "novo";
  const p = ((atual - anterior) / Math.abs(anterior)) * 100;
  return `${p > 0 ? "+" : ""}${p.toFixed(0)}%`;
}

export default async function DeclaracaoPage(props: PageProps<"/irpf/declaracoes/[declaracaoId]">) {
  const { declaracaoId } = await props.params;
  const supabase = await createClient();
  const { data: d } = await supabase
    .from("irpf_declaracoes")
    .select("*, irpf_contribuintes(id, nome, email, telefone)")
    .eq("id", declaracaoId)
    .maybeSingle();
  if (!d) notFound();

  const contribuinte = d.irpf_contribuintes as { id: string; nome: string; email: string | null; telefone: string | null };
  const resumo = d.resumo as ResumoGravado | null;

  const [{ data: anteriorRow }, { data: itens }, { data: arquivos }, { data: eventos }, equipe] = await Promise.all([
    supabase
      .from("irpf_declaracoes")
      .select("id, exercicio, resumo")
      .eq("contribuinte_id", contribuinte.id)
      .lt("exercicio", d.exercicio)
      .not("resumo", "is", null)
      .order("exercicio", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("irpf_checklist_itens")
      .select("id, categoria, descricao, status, origem, ordem")
      .eq("declaracao_id", declaracaoId)
      .order("ordem"),
    supabase
      .from("irpf_arquivos")
      .select("id, tipo, nome_arquivo, tamanho, retificadora, descricao, created_at")
      .eq("declaracao_id", declaracaoId)
      .order("created_at", { ascending: false }),
    supabase
      .from("irpf_eventos")
      .select("id, tipo, de, para, comentario, created_at, user_id")
      .eq("declaracao_id", declaracaoId)
      .order("created_at", { ascending: false })
      .limit(50),
    listarEquipe(),
  ]);
  const nomeEquipe = new Map(equipe.map((e) => [e.id, e.nome]));
  const anterior = (anteriorRow?.resumo as ResumoGravado | null) ?? null;
  const alerta = resumo ? alertaVariacaoPatrimonial(resumo) : null;
  const status = d.status as StatusDeclaracao;

  const textoEvento = (e: { tipo: string; de: string | null; para: string | null }) => {
    if (e.tipo === "STATUS")
      return `Situação: ${STATUS_LABEL[e.de as StatusDeclaracao] ?? e.de ?? "—"} → ${STATUS_LABEL[e.para as StatusDeclaracao] ?? e.para}`;
    if (e.tipo === "RESPONSAVEL" || e.tipo === "REVISOR")
      return `${e.tipo === "RESPONSAVEL" ? "Responsável" : "Revisor"}: ${e.para ? nomeEquipe.get(e.para) ?? "—" : "ninguém"}`;
    if (e.tipo === "HONORARIO") {
      const fmt = (v: string | null) =>
        v === null ? "—" : HONORARIO_LABEL[v as HonorarioStatus] ?? formatarMoeda(Number(v));
      return `Honorário: ${fmt(e.de)} → ${fmt(e.para)}`;
    }
    if (e.tipo === "IMPORTACAO") return "Arquivo importado";
    if (e.tipo === "RECEITA")
      return `Situação na Receita: ${e.para ? SITUACAO_RECEITA_LABEL[e.para as SituacaoReceitaTipo] ?? e.para : "sem informação"}`;
    return "Comentário";
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/irpf/declaracoes?ex=${d.exercicio}`} className="text-xs text-foreground/50 hover:text-foreground">
            ← Declarações {d.exercicio}
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-foreground">
            <Link href={`/irpf/contribuintes/${contribuinte.id}`} className="hover:text-brand">
              {contribuinte.nome}
            </Link>
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-foreground/60">
            <span>
              Exercício {d.exercicio} (ano-calendário {d.exercicio - 1})
            </span>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_PILL_CLASSES[STATUS_TOM[status]])}>
              {STATUS_LABEL[status]}
            </span>
            {d.completa !== null && <span>· {d.completa ? "Completa" : "Simplificada"}</span>}
            {d.retificadora && <span>· Retificadora</span>}
            {d.numero_recibo && <span>· Recibo {d.numero_recibo}</span>}
            {d.transmitida_em && <span>· transmitida em {formatarDataHora(d.transmitida_em)}</span>}
          </div>
        </div>
        {resumo && (
          <Link
            href={`/irpf/declaracoes/${declaracaoId}/relatorio`}
            className="inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand-hover"
          >
            Relatório para aprovação do cliente
          </Link>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          {!resumo ? (
            <Card className="p-6 text-sm text-foreground/60">
              Ainda não há arquivo .DEC desta declaração. Quando a declaração estiver gravada no programa do IRPF, envie o
              .DEC em <b>Arquivos</b> (ou pela tela Importar .DEC) para ver o resumo e gerar o relatório do cliente.
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Card className="p-4">
                  <div className="text-xs text-foreground/50">Resultado</div>
                  <div className="mt-1 text-lg font-semibold">
                    {resumo.resultado === "PAGAR" ? (
                      <Valor v={resumo.totais.impostoPagar} tom="danger" />
                    ) : resumo.resultado === "RESTITUIR" ? (
                      <Valor v={resumo.totais.impostoRestituir} tom="success" />
                    ) : (
                      "Sem saldo"
                    )}
                  </div>
                  <div className="text-xs text-foreground/50">
                    {resumo.resultado === "PAGAR"
                      ? resumo.totais.quotas > 1
                        ? `a pagar em ${resumo.totais.quotas} quotas de ${formatarMoeda(resumo.totais.valorQuota)}`
                        : "a pagar em quota única"
                      : resumo.resultado === "RESTITUIR"
                        ? "a restituir"
                        : ""}
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-foreground/50">Rendimentos tributáveis</div>
                  <div className="mt-1 text-lg font-semibold">{formatarMoeda(resumo.totais.rendimentosTributaveis)}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-foreground/50">Imposto devido</div>
                  <div className="mt-1 text-lg font-semibold">{formatarMoeda(resumo.totais.impostoDevido)}</div>
                  <div className="text-xs text-foreground/50">alíquota efetiva {resumo.totais.aliquotaEfetiva.toFixed(2)}%</div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-foreground/50">Patrimônio líquido</div>
                  <div className="mt-1 text-lg font-semibold">
                    {formatarMoeda(resumo.totais.bensAtual - resumo.totais.dividasAtual)}
                  </div>
                </Card>
              </div>

              {(resumo.parcial || (resumo.origem && resumo.origem !== "DEC")) && (
                <Card className="p-3 text-xs text-foreground/60">
                  {resumo.parcial
                    ? "Resumo lido só do recibo em PDF: tem os totais, o número e a data de entrega, mas não os rendimentos por fonte, as deduções nem os bens. Envie o PDF da declaração ou o .DEC para completar."
                    : "Resumo lido do PDF da declaração. O .DEC, se houver, é mais completo (traz também a conta de restituição e o título de eleitor)."}
                </Card>
              )}

              {alerta && (
                <Card className="border-warning/40 bg-warning-soft p-4 text-sm text-warning">
                  <b>Atenção — variação patrimonial:</b> o patrimônio líquido cresceu {formatarMoeda(alerta.excesso)} a mais
                  do que a renda declarada do ano (tributáveis + isentos + exclusivos − imposto). Confira se faltou rendimento,
                  empréstimo ou venda de bem.
                </Card>
              )}

              <Card className="overflow-hidden">
                <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">
                  Comparativo {anteriorRow ? `com ${anteriorRow.exercicio}` : "(sem declaração anterior importada)"}
                </div>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-foreground/50">
                    <tr>
                      <th className="px-5 py-2 font-medium" />
                      {anteriorRow && <th className="px-3 py-2 text-right font-medium">{anteriorRow.exercicio}</th>}
                      <th className="px-3 py-2 text-right font-medium">{d.exercicio}</th>
                      {anteriorRow && <th className="px-5 py-2 text-right font-medium">Variação</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {linhasComparativo(resumo, anterior).map((l) => (
                      <tr key={l.campo}>
                        <td className="px-5 py-1.5 text-foreground/70">{l.campo}</td>
                        {anteriorRow && (
                          <td className="px-3 py-1.5 text-right tabular-nums text-foreground/60">
                            {l.anterior === null ? "—" : formatarMoeda(l.anterior)}
                          </td>
                        )}
                        <td className="px-3 py-1.5 text-right tabular-nums">{formatarMoeda(l.atual)}</td>
                        {anteriorRow && (
                          <td className="px-5 py-1.5 text-right text-xs tabular-nums text-foreground/55">
                            {variacao(l.anterior, l.atual) ?? ""}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              <Card className="overflow-hidden">
                <details open>
                  <summary className="cursor-pointer border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">
                    Rendimentos de pessoa jurídica ({resumo.fontes.length})
                  </summary>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-border">
                      {resumo.fontes.map((f, i) => (
                        <tr key={i}>
                          <td className="px-5 py-1.5">{f.nome}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{formatarMoeda(f.rendimento)}</td>
                          <td className="px-5 py-1.5 text-right text-xs tabular-nums text-foreground/55">
                            IR retido {formatarMoeda(f.impostoRetido)}
                          </td>
                        </tr>
                      ))}
                      {resumo.fontes.length === 0 && (
                        <tr>
                          <td className="px-5 py-3 text-foreground/50">Nenhum.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </details>
              </Card>

              <Card className="overflow-hidden">
                <details>
                  <summary className="cursor-pointer border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">
                    Pagamentos efetuados ({resumo.pagamentos.length}) · deduções {formatarMoeda(resumo.totais.deducoes)}
                  </summary>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-border">
                      {resumo.pagamentos.map((p, i) => (
                        <tr key={i}>
                          <td className="px-5 py-1.5 text-xs text-foreground/55">{descricaoPagamento(p.codigo)}</td>
                          <td className="px-3 py-1.5">{p.beneficiario}</td>
                          <td className="px-5 py-1.5 text-right tabular-nums">{formatarMoeda(p.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </Card>

              <Card className="overflow-hidden">
                <details>
                  <summary className="cursor-pointer border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">
                    Bens e direitos ({resumo.bens.length}) · dívidas ({resumo.dividas.length}) · dependentes (
                    {resumo.dependentes.length})
                  </summary>
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-foreground/50">
                      <tr>
                        <th className="px-5 py-2 font-medium">Bem / dívida</th>
                        <th className="px-3 py-2 text-right font-medium">31/12/{d.exercicio - 2}</th>
                        <th className="px-5 py-2 text-right font-medium">31/12/{d.exercicio - 1}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {resumo.bens.map((b, i) => (
                        <tr key={`b${i}`}>
                          <td className="px-5 py-1.5" title={b.descricao}>
                            {resumirTexto(b.descricao, 90)}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-foreground/60">{formatarMoeda(b.valorAnterior)}</td>
                          <td className="px-5 py-1.5 text-right tabular-nums">{formatarMoeda(b.valorAtual)}</td>
                        </tr>
                      ))}
                      {resumo.dividas.map((b, i) => (
                        <tr key={`d${i}`} className="text-danger">
                          <td className="px-5 py-1.5" title={b.descricao}>
                            Dívida: {resumirTexto(b.descricao, 80)}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{formatarMoeda(b.valorAnterior)}</td>
                          <td className="px-5 py-1.5 text-right tabular-nums">{formatarMoeda(b.valorAtual)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {resumo.dependentes.length > 0 && (
                    <div className="border-t border-border px-5 py-3 text-sm text-foreground/70">
                      Dependentes: {resumo.dependentes.map((x) => x.nome).join(", ")}
                    </div>
                  )}
                </details>
              </Card>
            </>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <SituacaoReceita
            id={declaracaoId}
            situacao={(d.situacao_receita as SituacaoReceitaTipo | null) ?? null}
            desde={d.situacao_receita_em}
            transmitida={status === "TRANSMITIDA"}
          />
          <ControleDeclaracao
            id={declaracaoId}
            status={status}
            responsavelId={d.responsavel_id}
            revisorId={d.revisor_id}
            honorarioValor={d.honorario_valor === null ? null : Number(d.honorario_valor)}
            honorarioStatus={d.honorario_status as HonorarioStatus}
            observacoes={d.observacoes}
            equipe={equipe}
          />
          <ChecklistDeclaracao
            declaracaoId={declaracaoId}
            itens={(itens ?? []).map((i) => ({ ...i, status: i.status as ChecklistStatus }))}
          />
          <ArquivosDeclaracao declaracaoId={declaracaoId} arquivos={arquivos ?? []} />
          <Card className="p-4">
            <div className="mb-2 text-sm font-semibold text-foreground/70">Histórico</div>
            <ul className="flex flex-col gap-2 text-xs">
              {(eventos ?? []).map((e) => (
                <li key={e.id} className="text-foreground/65">
                  <span className="text-foreground/40">
                    {formatarDataHora(e.created_at)} · {e.user_id ? nomeEquipe.get(e.user_id) ?? "—" : "sistema"}
                  </span>
                  <br />
                  {textoEvento(e)}
                  {e.comentario && <span className="text-foreground/50"> — {e.comentario}</span>}
                </li>
              ))}
              {!eventos?.length && <li className="text-foreground/40">Sem movimentação.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
