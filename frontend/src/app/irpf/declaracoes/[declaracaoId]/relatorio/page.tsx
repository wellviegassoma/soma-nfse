import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { formatarCpf, formatarMoeda } from "@/lib/formatters";
import {
  descricaoPagamento,
  linhasComparativo,
  prazoEntrega,
  resumirTexto,
  type ResumoGravado,
  type StatusDeclaracao,
} from "@/lib/irpf/comum";
import { AcoesRelatorio } from "./AcoesRelatorio";

export const metadata = { title: "Resumo da declaração para aprovação" };

const dataBr = (iso: string) => iso.split("-").reverse().join("/");

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-2 border-b border-neutral-300 pb-1 text-sm font-semibold uppercase tracking-wide text-neutral-600">{titulo}</h2>
      {children}
    </section>
  );
}

export default async function RelatorioPage(props: PageProps<"/irpf/declaracoes/[declaracaoId]/relatorio">) {
  const { declaracaoId } = await props.params;
  const supabase = await createClient();
  const { data: d } = await supabase
    .from("irpf_declaracoes")
    .select("id, exercicio, status, resumo, contribuinte_id, irpf_contribuintes(nome, cpf)")
    .eq("id", declaracaoId)
    .maybeSingle();
  if (!d || !d.resumo) notFound();
  const r = d.resumo as ResumoGravado;
  const c = d.irpf_contribuintes as unknown as { nome: string; cpf: string };
  const { data: anteriorRow } = await supabase
    .from("irpf_declaracoes")
    .select("exercicio, resumo")
    .eq("contribuinte_id", d.contribuinte_id)
    .lt("exercicio", d.exercicio)
    .not("resumo", "is", null)
    .order("exercicio", { ascending: false })
    .limit(1)
    .maybeSingle();
  const anterior = (anteriorRow?.resumo as ResumoGravado | null) ?? null;
  const t = r.totais;
  const prazo = prazoEntrega(d.exercicio);
  const comparativo = linhasComparativo(r, anterior);
  const deducoes = r.pagamentos.filter((p) => p.valor - p.parcelaNaoDedutivel > 0);
  const rendPF = t.rendimentosTributaveis - r.fontes.reduce((s, f) => s + f.rendimento, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="print:hidden">
        <Link href={`/irpf/declaracoes/${declaracaoId}`} className="text-xs text-foreground/50 hover:text-foreground">
          ← Voltar à declaração
        </Link>
        <AcoesRelatorio declaracaoId={declaracaoId} status={d.status as StatusDeclaracao} />
      </div>

      <article className="mx-auto w-full max-w-[52rem] bg-white p-8 text-[13px] leading-relaxed text-neutral-900 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="mb-6 flex items-start justify-between gap-6 border-b-2 border-neutral-800 pb-4">
          <div>
            <h1 className="text-lg font-bold">Resumo da sua Declaração de Imposto de Renda</h1>
            <div className="text-neutral-600">
              Exercício {d.exercicio} · ano-calendário {d.exercicio - 1}
              {r.retificadora ? " · retificadora" : ""}
            </div>
            <div className="mt-2">
              <b>{c.nome}</b> · CPF {formatarCpf(c.cpf)}
            </div>
          </div>
          <Logo />
        </header>

        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-neutral-300 p-3">
            <div className="text-xs text-neutral-500">Resultado</div>
            <div className={`text-xl font-bold ${r.resultado === "PAGAR" ? "text-red-700" : r.resultado === "RESTITUIR" ? "text-green-700" : ""}`}>
              {r.resultado === "PAGAR"
                ? `A pagar ${formatarMoeda(t.impostoPagar)}`
                : r.resultado === "RESTITUIR"
                  ? `A restituir ${formatarMoeda(t.impostoRestituir)}`
                  : "Sem imposto a pagar ou restituir"}
            </div>
            {r.resultado === "PAGAR" && (
              <div className="text-xs text-neutral-600">
                {t.quotas > 1
                  ? `Em ${t.quotas} quotas de ${formatarMoeda(t.valorQuota)} (a 1ª vence em ${dataBr(prazo)}; as demais com juros Selic)`
                  : `Quota única com vencimento em ${dataBr(prazo)}`}
              </div>
            )}
          </div>
          <div className="rounded-lg border border-neutral-300 p-3">
            <div className="text-xs text-neutral-500">Forma de tributação</div>
            <div className="text-base font-semibold">{r.completa ? "Deduções legais (completa)" : "Desconto simplificado"}</div>
                      </div>
          <div className="rounded-lg border border-neutral-300 p-3">
            <div className="text-xs text-neutral-500">Imposto devido no ano</div>
            <div className="text-base font-semibold">{formatarMoeda(t.impostoDevido)}</div>
            <div className="text-xs text-neutral-600">
              já pago / retido {formatarMoeda(t.impostoPago)} · alíquota efetiva {t.aliquotaEfetiva.toFixed(2)}%
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <Secao titulo={anterior ? `Comparação com a declaração de ${anteriorRow!.exercicio}` : "Números principais"}>
            <table className="w-full">
              <thead className="text-left text-xs text-neutral-500">
                <tr>
                  <th className="py-1 font-medium" />
                  {anterior && <th className="py-1 text-right font-medium">{anteriorRow!.exercicio}</th>}
                  <th className="py-1 text-right font-medium">{d.exercicio}</th>
                </tr>
              </thead>
              <tbody>
                {comparativo.map((l) => (
                  <tr key={l.campo} className="border-t border-neutral-200">
                    <td className="py-1">{l.campo}</td>
                    {anterior && <td className="py-1 text-right tabular-nums text-neutral-500">{formatarMoeda(l.anterior ?? 0)}</td>}
                    <td className="py-1 text-right tabular-nums">{formatarMoeda(l.atual)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Secao>

          <Secao titulo="Rendimentos tributáveis">
            <table className="w-full">
              <tbody>
                {r.fontes.map((f, i) => (
                  <tr key={i} className="border-t border-neutral-200">
                    <td className="py-1">{f.nome}</td>
                    <td className="py-1 text-right tabular-nums">{formatarMoeda(f.rendimento)}</td>
                    <td className="py-1 text-right text-xs tabular-nums text-neutral-500">IR retido {formatarMoeda(f.impostoRetido)}</td>
                  </tr>
                ))}
                {rendPF > 0.5 && (
                  <tr className="border-t border-neutral-200">
                    <td className="py-1">Recebidos de pessoas físicas / exterior / aluguéis (Carnê-Leão)</td>
                    <td className="py-1 text-right tabular-nums">{formatarMoeda(rendPF)}</td>
                    <td className="py-1 text-right text-xs tabular-nums text-neutral-500">
                      {t.carneLeao > 0 ? `Carnê-Leão pago ${formatarMoeda(t.carneLeao)}` : ""}
                    </td>
                  </tr>
                )}
                <tr className="border-t border-neutral-400 font-semibold">
                  <td className="py-1">Total</td>
                  <td className="py-1 text-right tabular-nums">{formatarMoeda(t.rendimentosTributaveis)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
            <p className="mt-1 text-xs text-neutral-600">
              Rendimentos isentos: {formatarMoeda(t.rendimentosIsentos)} · tributação exclusiva (13º, aplicações etc.):{" "}
              {formatarMoeda(t.rendimentosExclusivos)}
            </p>
          </Secao>

          {(r.completa ? t.deducoes > 0 : true) && (
            <Secao titulo={r.completa ? "Deduções" : "Desconto simplificado"}>
              {r.completa ? (
                <table className="w-full">
                  <tbody>
                    {deducoes.map((p, i) => (
                      <tr key={i} className="border-t border-neutral-200">
                        <td className="py-1 text-xs text-neutral-500">{descricaoPagamento(p.codigo)}</td>
                        <td className="py-1">{p.beneficiario}</td>
                        <td className="py-1 text-right tabular-nums">{formatarMoeda(p.valor - p.parcelaNaoDedutivel)}</td>
                      </tr>
                    ))}
                    {t.previdenciaOficial > 0 && (
                      <tr className="border-t border-neutral-200">
                        <td className="py-1 text-xs text-neutral-500">INSS</td>
                        <td className="py-1">Previdência oficial</td>
                        <td className="py-1 text-right tabular-nums">{formatarMoeda(t.previdenciaOficial)}</td>
                      </tr>
                    )}
                    {t.livroCaixa > 0 && (
                      <tr className="border-t border-neutral-200">
                        <td className="py-1 text-xs text-neutral-500">Livro-caixa</td>
                        <td className="py-1">Despesas da atividade (Carnê-Leão)</td>
                        <td className="py-1 text-right tabular-nums">{formatarMoeda(t.livroCaixa)}</td>
                      </tr>
                    )}
                    {t.pensao > 0 && (
                      <tr className="border-t border-neutral-200">
                        <td className="py-1 text-xs text-neutral-500">Pensão</td>
                        <td className="py-1">Pensão alimentícia</td>
                        <td className="py-1 text-right tabular-nums">{formatarMoeda(t.pensao)}</td>
                      </tr>
                    )}
                    {t.dependentes > 0 && (
                      <tr className="border-t border-neutral-200">
                        <td className="py-1 text-xs text-neutral-500">Dependentes</td>
                        <td className="py-1">Dedução por dependente</td>
                        <td className="py-1 text-right tabular-nums">{formatarMoeda(t.dependentes)}</td>
                      </tr>
                    )}
                    <tr className="border-t border-neutral-400 font-semibold">
                      <td className="py-1" colSpan={2}>
                        Total das deduções (com os limites legais)
                      </td>
                      <td className="py-1 text-right tabular-nums">{formatarMoeda(t.deducoes)}</td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <p>
                  Desconto de {formatarMoeda(t.deducoes)} (20% dos rendimentos tributáveis, limitado pela lei), no lugar das
                  despesas dedutíveis.
                </p>
              )}
            </Secao>
          )}

          {r.dependentes.length > 0 && (
            <Secao titulo="Dependentes">
              <p>{r.dependentes.map((x) => x.nome).join(" · ")}</p>
            </Secao>
          )}

          <Secao titulo="Bens e direitos">
            <table className="w-full">
              <thead className="text-left text-xs text-neutral-500">
                <tr>
                  <th className="py-1 font-medium">Descrição</th>
                  <th className="py-1 text-right font-medium">31/12/{d.exercicio - 2}</th>
                  <th className="py-1 text-right font-medium">31/12/{d.exercicio - 1}</th>
                </tr>
              </thead>
              <tbody>
                {r.bens.map((b, i) => (
                  <tr key={i} className="border-t border-neutral-200 align-top">
                    <td className="py-1 pr-3">{resumirTexto(b.descricao, 140)}</td>
                    <td className="py-1 text-right tabular-nums text-neutral-500">{formatarMoeda(b.valorAnterior)}</td>
                    <td className="py-1 text-right tabular-nums">{formatarMoeda(b.valorAtual)}</td>
                  </tr>
                ))}
                <tr className="border-t border-neutral-400 font-semibold">
                  <td className="py-1">Total</td>
                  <td className="py-1 text-right tabular-nums">{formatarMoeda(t.bensAnterior)}</td>
                  <td className="py-1 text-right tabular-nums">{formatarMoeda(t.bensAtual)}</td>
                </tr>
              </tbody>
            </table>
          </Secao>

          {r.dividas.length > 0 && (
            <Secao titulo="Dívidas e ônus reais">
              <table className="w-full">
                <tbody>
                  {r.dividas.map((b, i) => (
                    <tr key={i} className="border-t border-neutral-200 align-top">
                      <td className="py-1 pr-3">{resumirTexto(b.descricao, 140)}</td>
                      <td className="py-1 text-right tabular-nums text-neutral-500">{formatarMoeda(b.valorAnterior)}</td>
                      <td className="py-1 text-right tabular-nums">{formatarMoeda(b.valorAtual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Secao>
          )}

          <Secao titulo="Sua aprovação">
            <p>
              Confira as informações acima. Se estiver tudo certo, responda <b>&quot;De acordo&quot;</b> para transmitirmos a
              declaração. Se faltar algum rendimento, despesa, dependente, bem ou dívida, ou se algum valor estiver diferente,
              avise antes da transmissão — o prazo final de entrega é {dataBr(prazo)}.
            </p>
            <div className="mt-10 grid grid-cols-2 gap-10 text-xs text-neutral-600">
              <div className="border-t border-neutral-500 pt-1">{c.nome}</div>
              <div className="border-t border-neutral-500 pt-1">Data</div>
            </div>
          </Secao>
        </div>

        <footer className="mt-8 border-t border-neutral-300 pt-2 text-[11px] text-neutral-500">
          Resumo preparado pela SOMA a partir da declaração gravada no programa da Receita Federal. O documento oficial é o
          recibo de entrega emitido após a transmissão.
        </footer>
      </article>
    </div>
  );
}
