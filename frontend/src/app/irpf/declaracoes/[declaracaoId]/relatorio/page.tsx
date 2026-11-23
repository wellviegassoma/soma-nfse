import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatarCpf } from "@/lib/formatters";
import {
  DEPENDENCIA_LABEL,
  TIPO_CONTA_LABEL,
  prazoEntrega,
  resumirTexto,
  type ResumoGravado,
  type StatusDeclaracao,
} from "@/lib/irpf/comum";
import { analisar, grupoDoBem, rotuloGrupo } from "@/lib/irpf/analise";
import { AcoesRelatorio } from "./AcoesRelatorio";
import { AZUL, DOURADO, VERDE, VERMELHO, Barra, GraficoComposicao, GraficoEvolucao, PontePatrimonial } from "./graficos";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brl0 = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const dataBr = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const variacaoPct = (a: number | null, b: number) =>
  a === null || a === 0 ? null : `${b >= a ? "+" : ""}${(((b - a) / Math.abs(a)) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

type Contribuinte = {
  id: string;
  nome: string;
  cpf: string;
  nascimento: string | null;
  email: string | null;
  celular: string | null;
  telefone: string | null;
  tipo_logradouro: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  conta_dv: string | null;
  tipo_conta: string | null;
};

async function carregar(declaracaoId: string) {
  const supabase = await createClient();
  const { data: d } = await supabase
    .from("irpf_declaracoes")
    .select("id, exercicio, status, resumo, contribuinte_id, numero_recibo, transmitida_em")
    .eq("id", declaracaoId)
    .maybeSingle();
  if (!d || !d.resumo) return null;
  const [{ data: c }, { data: outros }] = await Promise.all([
    supabase
      .from("irpf_contribuintes")
      .select(
        "id, nome, cpf, nascimento, email, celular, telefone, tipo_logradouro, logradouro, numero, complemento, bairro, municipio, uf, cep, banco, agencia, conta, conta_dv, tipo_conta",
      )
      .eq("id", d.contribuinte_id)
      .maybeSingle(),
    supabase
      .from("irpf_declaracoes")
      .select("exercicio, resumo")
      .eq("contribuinte_id", d.contribuinte_id)
      .lte("exercicio", d.exercicio)
      .not("resumo", "is", null),
  ]);
  if (!c) return null;
  return { d, c: c as Contribuinte, anos: (outros ?? []).map((o) => ({ exercicio: o.exercicio as number, resumo: o.resumo as ResumoGravado })) };
}

export async function generateMetadata(props: PageProps<"/irpf/declaracoes/[declaracaoId]/relatorio">) {
  const { declaracaoId } = await props.params;
  const x = await carregar(declaracaoId);
  // O título vira o nome do arquivo ao "Salvar como PDF".
  return { title: x ? `IRPF ${x.d.exercicio} - ${x.c.nome} - SOMA` : "Relatório IRPF" };
}

function Pagina({ children, numero, total }: { children: React.ReactNode; numero: number; total: number }) {
  return (
    <section className="pagina relative mx-auto mb-6 w-full max-w-[210mm] bg-white px-[14mm] pb-[8mm] pt-[12mm] text-[12.5px] leading-relaxed text-slate-800 shadow-sm print:mb-0 print:pb-0 print:pt-0 print:shadow-none">
      {children}
      <footer className="mt-8 flex items-center justify-between border-t border-slate-200 pt-1.5 text-[10px] text-slate-400">
        <span>SOMA Contabilidade Integrada · Relatório preparado a partir da sua declaração</span>
        <span>
          {numero} / {total}
        </span>
      </footer>
    </section>
  );
}

function Titulo({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-3 mt-1">
      <h2 className="text-[15px] font-bold tracking-tight" style={{ color: AZUL }}>
        {children}
      </h2>
      <div className="mt-1 h-[3px] w-10 rounded" style={{ background: DOURADO }} />
      {sub && <p className="mt-1.5 text-[11.5px] text-slate-500">{sub}</p>}
    </div>
  );
}

function Cabecalho({ nome, exercicio }: { nome: string; exercicio: number }) {
  return (
    <div className="mb-5 flex items-center justify-between border-b border-slate-200 pb-2 text-[10.5px] text-slate-500">
      <span>
        {nome} · Exercício {exercicio}
      </span>
      <Image src="/soma-logo.png" alt="SOMA" width={64} height={64} className="h-10 w-10 object-contain" />
    </div>
  );
}

export default async function RelatorioPage(props: PageProps<"/irpf/declaracoes/[declaracaoId]/relatorio">) {
  const { declaracaoId } = await props.params;
  const x = await carregar(declaracaoId);
  if (!x) notFound();
  const { d, c } = x;
  const r = d.resumo as ResumoGravado;
  const t = r.totais;
  const a = analisar(x.anos, d.exercicio);
  const ant = a.anterior?.resumo ?? null;
  const prazo = prazoEntrega(d.exercicio);
  const transmitida = d.status === "TRANSMITIDA";
  const totalPaginas = r.parcial ? 2 : 4;
  // Depois de entregue, o alerta de variação patrimonial fica só na análise interna
  // (antes da transmissão ele serve para o cliente lembrar o que faltou).
  const mostrarAlerta = !transmitida && a.descoberto > 1;
  const destaques = a.destaques.filter((dq) => dq.tom !== "atencao" || mostrarAlerta);

  const resultado =
    r.resultado === "PAGAR"
      ? { rotulo: "Imposto a pagar", valor: t.impostoPagar, cor: VERMELHO }
      : r.resultado === "RESTITUIR"
        ? { rotulo: "Imposto a restituir", valor: t.impostoRestituir, cor: VERDE }
        : { rotulo: "Sem imposto a pagar ou restituir", valor: 0, cor: AZUL };

  const endereco = [[c.tipo_logradouro, c.logradouro].filter(Boolean).join(" "), c.numero, c.complemento, c.bairro].filter(Boolean).join(", ");
  const cidade = [c.municipio, c.uf].filter(Boolean).join(" / ");
  const fone = (f: string | null) => (f && f.length >= 10 ? `(${f.slice(0, 2)}) ${f.slice(2, -4)}-${f.slice(-4)}` : f ?? "—");
  const contaRestituicao =
    c.tipo_conta === "4"
      ? "Pix (chave CPF)"
      : c.banco
        ? `${TIPO_CONTA_LABEL[c.tipo_conta ?? ""] ?? "Conta"} · banco ${c.banco} · agência ${c.agencia ?? "—"} · conta ${c.conta ?? "—"}${c.conta_dv ? `-${c.conta_dv}` : ""}`
        : "Não informada";

  const kpi = (rotulo: string, valor: string, sub?: string | null) => (
    <div className="rounded-xl border border-slate-200 p-3.5">
      <div className="text-[10.5px] uppercase tracking-wide text-slate-500">{rotulo}</div>
      <div className="mt-1 text-[17px] font-bold" style={{ color: AZUL }}>
        {valor}
      </div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );

  return (
    <div className="flex flex-col gap-4 bg-slate-100 print:bg-white">
      <style>{`
        @page { size: A4; margin: 11mm 0 12mm 0; }
        @media print {
          html, body { background: #fff !important; }
          .pagina { break-after: page; max-width: none !important; }
          .pagina:last-of-type { break-after: auto; }
          .capa { margin-top: 0 !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .pagina .evitar-quebra { break-inside: avoid; }
        .pagina tr { break-inside: avoid; }
      `}</style>

      <div className="mx-auto w-full max-w-[210mm] print:hidden">
        <Link href={`/irpf/declaracoes/${declaracaoId}`} className="text-xs text-foreground/50 hover:text-foreground">
          ← Voltar à declaração
        </Link>
        <AcoesRelatorio declaracaoId={declaracaoId} status={d.status as StatusDeclaracao} />
        {r.parcial && (
          <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
            Este resumo veio só do recibo: rendimentos por fonte, deduções e bens não aparecem. Importe o .DEC ou o PDF da
            declaração para o relatório completo.
          </div>
        )}
      </div>

      {/* ---------------- Página 1: capa e resultado ---------------- */}
      <Pagina numero={1} total={totalPaginas}>
        <div className="capa -mx-[14mm] -mt-[12mm] mb-6 px-[14mm] pb-7 pt-8 text-white" style={{ background: `linear-gradient(135deg, ${AZUL} 0%, #2A4F7C 100%)` }}>
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em]" style={{ color: DOURADO }}>
                Imposto de Renda Pessoa Física
              </div>
              <h1 className="mt-2 text-[26px] font-bold leading-tight">Sua declaração {d.exercicio}</h1>
              <div className="mt-1 text-[13px] text-white/80">
                Ano-calendário {d.exercicio - 1}
                {r.retificadora ? " · retificadora" : ""} · {r.completa ? "deduções legais (completa)" : "desconto simplificado"}
              </div>
              <div className="mt-5 text-[15px] font-semibold">{c.nome}</div>
              <div className="text-[12px] text-white/75">CPF {formatarCpf(c.cpf)}</div>
            </div>
            <div className="rounded-xl bg-white p-2">
              <Image src="/soma-logo.png" alt="SOMA Contabilidade Integrada" width={120} height={120} className="h-24 w-24 object-contain" priority />
            </div>
          </div>
        </div>

        <div className="evitar-quebra mb-5 grid grid-cols-[1.3fr_1fr] gap-4">
          <div className="rounded-2xl border-2 p-5" style={{ borderColor: resultado.cor }}>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">{resultado.rotulo}</div>
            <div className="mt-1 text-[30px] font-extrabold" style={{ color: resultado.cor }}>
              {r.resultado === "SEM_SALDO" ? "R$ 0,00" : brl(resultado.valor)}
            </div>
            <div className="mt-1 text-[12px] text-slate-600">
              {r.resultado === "PAGAR"
                ? t.quotas > 1
                  ? `Em ${t.quotas} quotas de ${brl(t.valorQuota)} — a 1ª vence em ${dataBr(prazo)}; as demais com juros Selic.`
                  : `Quota única com vencimento em ${dataBr(prazo)}.`
                : r.resultado === "RESTITUIR"
                  ? `Depositado na conta informada (${contaRestituicao}), conforme os lotes da Receita.`
                  : "O imposto retido durante o ano cobriu exatamente o imposto devido."}
            </div>
            {transmitida && d.numero_recibo && (
              <div className="mt-2 text-[11px] text-slate-500">
                Entregue em {dataBr(d.transmitida_em)} · recibo {d.numero_recibo}
              </div>
            )}
          </div>
          <div className="grid gap-3">
            {kpi(
              "Imposto devido no ano",
              brl(t.impostoDevido),
              r.parcial ? null : `alíquota efetiva ${t.aliquotaEfetiva.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%${
                ant && !ant.parcial ? ` (antes ${ant.totais.aliquotaEfetiva.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%)` : ""
              }`,
            )}
            {kpi("Já pago ou retido na fonte", brl(t.impostoPago), r.parcial ? null : `carnê-leão: ${brl(t.carneLeao)}`)}
          </div>
        </div>

        {!r.parcial && (
          <div className="evitar-quebra mb-5 grid grid-cols-3 gap-3">
            {kpi("Rendimentos totais", brl0(a.rendaTotal), ant ? `${variacaoPct(a.serie.at(-2)?.rendaTotal ?? null, a.rendaTotal) ?? ""} sobre o ano anterior` : "tributáveis, isentos e exclusivos")}
            {kpi("Patrimônio líquido", brl0(a.plFim), `${a.variacao >= 0 ? "+" : "−"}${brl0(Math.abs(a.variacao))} no ano`)}
            {kpi("Deduções / desconto", brl0(t.deducoes), r.completa ? "deduções legais" : "desconto simplificado")}
          </div>
        )}

        {destaques.length > 0 && (
          <div className="evitar-quebra">
            <Titulo>Destaques do seu ano</Titulo>
            <div className="grid gap-2.5">
              {destaques.map((dq) => (
                <div
                  key={dq.titulo}
                  className="rounded-lg border-l-4 bg-slate-50 px-3.5 py-2.5"
                  style={{ borderColor: dq.tom === "atencao" ? VERMELHO : dq.tom === "bom" ? VERDE : DOURADO }}
                >
                  <div className="text-[12.5px] font-semibold text-slate-900">{dq.titulo}</div>
                  <div className="text-[12px] text-slate-600">{dq.texto}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Pagina>

      {!r.parcial && (
        <>
          {/* ---------------- Página 2: evolução ---------------- */}
          <Pagina numero={2} total={totalPaginas}>
            <Cabecalho nome={c.nome} exercicio={d.exercicio} />
            <Titulo sub="Barras: patrimônio líquido em 31/12 de cada ano (bens menos dívidas). Linha dourada: rendimentos totais do ano.">
              Sua evolução {a.serie.length > 1 ? `nos últimos ${a.serie.length} anos` : "no ano"}
            </Titulo>
            <div className="evitar-quebra mb-2">
              <GraficoEvolucao serie={a.serie} />
            </div>
            {a.serie.length > 1 && (
              <table className="evitar-quebra mb-6 w-full text-[11.5px]">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1 font-medium">Ano-calendário</th>
                    {a.serie.map((s) => (
                      <th key={s.exercicio} className="py-1 text-right font-medium">
                        {s.anoCalendario}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["Rendimentos totais", (s) => brl0(s.rendaTotal)],
                      ["Imposto devido", (s) => brl0(s.impostoDevido)],
                      ["Alíquota efetiva", (s) => `${s.aliquota.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`],
                      ["Bens e direitos", (s) => brl0(s.bens)],
                      ["Dívidas", (s) => brl0(s.dividas)],
                      ["Patrimônio líquido", (s) => brl0(s.patrimonio)],
                    ] as [string, (s: (typeof a.serie)[number]) => string][]
                  ).map(([rotulo, f]) => (
                    <tr key={rotulo} className="border-t border-slate-100">
                      <td className="py-1 text-slate-600">{rotulo}</td>
                      {a.serie.map((s, i) => (
                        <td key={s.exercicio} className={`py-1 text-right tabular-nums ${i === a.serie.length - 1 ? "font-semibold text-slate-900" : "text-slate-500"}`}>
                          {s.parcial && rotulo !== "Imposto devido" && rotulo !== "Rendimentos totais" ? "—" : f(s)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="evitar-quebra mb-6">
              <Titulo sub="De onde veio (ou para onde foi) a variação do seu patrimônio no ano. A Receita faz esta mesma conta para checar se o crescimento do patrimônio é coerente com a renda declarada.">
                Conciliação do patrimônio no ano
              </Titulo>
              <PontePatrimonial inicio={a.plInicio} renda={a.rendaDisponivel} gastos={a.gastosEstimados} fim={a.plFim} />
              <p className="mt-2 text-[11.5px] text-slate-600">
                {mostrarAlerta ? (
                  <span style={{ color: VERMELHO }}>
                    <b>Atenção:</b> o patrimônio cresceu {brl0(a.descoberto)} além do que a renda declarada explica. Confira se ficou de fora algum
                    rendimento, empréstimo, venda de bem ou doação recebida.
                  </span>
                ) : a.descoberto > 1 ? (
                  <>
                    Parte do crescimento do patrimônio vem de origens que não aparecem como renda nesta conta (por exemplo, valorização de
                    aplicações já tributada, financiamentos ou recursos de anos anteriores).
                  </>
                ) : (
                  <>
                    Da renda do ano, cerca de <b>{brl0(a.gastosEstimados)}</b> foram para gastos do dia a dia e despesas (estimativa: renda líquida menos
                    a variação do patrimônio). A evolução está <b style={{ color: VERDE }}>compatível</b> com a renda declarada.
                  </>
                )}
              </p>
            </div>

            {a.composicao.length > 0 && (
              <div className="evitar-quebra grid grid-cols-[1fr_1.1fr] gap-6">
                <div>
                  <Titulo>Como está o seu patrimônio</Titulo>
                  <GraficoComposicao itens={a.composicao.map((g) => ({ rotulo: g.rotulo, valor: g.atual }))} />
                </div>
                <div>
                  <Titulo>Por tipo de bem</Titulo>
                  <table className="w-full text-[11.5px]">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="py-1 font-medium" />
                        <th className="py-1 text-right font-medium">31/12/{d.exercicio - 2}</th>
                        <th className="py-1 text-right font-medium">31/12/{d.exercicio - 1}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.composicao.map((g) => (
                        <tr key={g.grupo} className="border-t border-slate-100">
                          <td className="py-1 text-slate-700">{g.rotulo}</td>
                          <td className="py-1 text-right tabular-nums text-slate-500">{brl0(g.anterior)}</td>
                          <td className="py-1 text-right font-medium tabular-nums">{brl0(g.atual)}</td>
                        </tr>
                      ))}
                      {t.dividasAtual > 0 || t.dividasAnterior > 0 ? (
                        <tr className="border-t border-slate-100" style={{ color: VERMELHO }}>
                          <td className="py-1">(−) Dívidas</td>
                          <td className="py-1 text-right tabular-nums">{brl0(t.dividasAnterior)}</td>
                          <td className="py-1 text-right tabular-nums">{brl0(t.dividasAtual)}</td>
                        </tr>
                      ) : null}
                      <tr className="border-t-2 border-slate-300 font-semibold" style={{ color: AZUL }}>
                        <td className="py-1">Patrimônio líquido</td>
                        <td className="py-1 text-right tabular-nums">{brl0(a.plInicio)}</td>
                        <td className="py-1 text-right tabular-nums">{brl0(a.plFim)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Pagina>

          {/* ---------------- Página 3: rendimentos e deduções ---------------- */}
          <Pagina numero={3} total={totalPaginas}>
            <Cabecalho nome={c.nome} exercicio={d.exercicio} />
            <Titulo sub="Confira se todas as fontes que te pagaram no ano estão aqui, com os valores do informe de rendimentos.">
              Suas fontes de renda
            </Titulo>
            <div className="mb-3 grid gap-2">
              {a.fontes.map((f, i) => (
                <div key={`${f.documento}-${i}`} className="evitar-quebra grid grid-cols-[1fr_7rem_7rem] items-center gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-800">{f.nome}</div>
                    <Barra pct={f.participacao} cor={i === 0 ? AZUL : "#5B7FA6"} />
                  </div>
                  <div className="text-right tabular-nums">{brl(f.rendimento)}</div>
                  <div className="text-right text-[11px] tabular-nums text-slate-500">IR retido {brl(f.impostoRetido)}</div>
                </div>
              ))}
              {a.outrosTributaveis > 1 && (
                <div className="grid grid-cols-[1fr_7rem_7rem] items-center gap-3">
                  <div className="text-slate-700">Pessoas físicas, aluguéis e exterior (carnê-leão)</div>
                  <div className="text-right tabular-nums">{brl(a.outrosTributaveis)}</div>
                  <div className="text-right text-[11px] tabular-nums text-slate-500">carnê-leão {brl(t.carneLeao)}</div>
                </div>
              )}
            </div>
            <div className="mb-6 grid grid-cols-3 gap-3 text-[12px]">
              {kpi("Tributáveis", brl0(t.rendimentosTributaveis))}
              {kpi("Isentos", brl0(t.rendimentosIsentos), "lucros, dividendos, poupança…")}
              {kpi("Tributação exclusiva", brl0(t.rendimentosExclusivos), "13º, aplicações financeiras…")}
            </div>

            {(r.completa ? a.deducoes.length > 0 : true) && (
              <div className="evitar-quebra mb-6">
                <Titulo sub={r.completa ? "Despesas que reduziram o seu imposto (com os limites da lei)." : undefined}>
                  {r.completa ? "Suas deduções" : "Desconto simplificado"}
                </Titulo>
                {r.completa ? (
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="py-1 font-medium">Categoria</th>
                        {a.anterior && <th className="py-1 text-right font-medium">Ano anterior</th>}
                        <th className="py-1 text-right font-medium">Este ano</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.deducoes.map((dd) => (
                        <tr key={dd.categoria} className="border-t border-slate-100">
                          <td className="py-1 text-slate-700">{dd.categoria}</td>
                          {a.anterior && <td className="py-1 text-right tabular-nums text-slate-500">{dd.anterior !== null ? brl(dd.anterior) : "—"}</td>}
                          <td className="py-1 text-right font-medium tabular-nums">{brl(dd.atual)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-slate-300 font-semibold" style={{ color: AZUL }}>
                        <td className="py-1">Total dedutível (após limites)</td>
                        {a.anterior && <td className="py-1 text-right tabular-nums">{brl(ant!.totais.deducoes)}</td>}
                        <td className="py-1 text-right tabular-nums">{brl(t.deducoes)}</td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <p className="text-[12px] text-slate-600">
                    Você usou o desconto simplificado de {brl(t.deducoes)} (20% dos rendimentos tributáveis, limitado pela lei) no lugar das
                    despesas dedutíveis — foi a opção mais vantajosa com os seus dados.
                  </p>
                )}
              </div>
            )}

            {r.completa && a.maioresPagamentos.length > 0 && (
              <div className="evitar-quebra mb-6">
                <Titulo sub="Confira se não falta nenhum médico, dentista, plano de saúde, escola ou previdência.">Pagamentos informados</Titulo>
                <table className="w-full text-[11.5px]">
                  <tbody>
                    {a.maioresPagamentos.slice(0, 14).map((p, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="py-0.5 text-slate-500">{p.tipo}</td>
                        <td className="py-0.5 text-slate-800">{p.beneficiario}</td>
                        <td className="py-0.5 text-right tabular-nums">{brl(p.dedutivel)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {a.maioresPagamentos.length > 14 && (
                  <p className="mt-1 text-[11px] text-slate-500">+ {a.maioresPagamentos.length - 14} pagamento(s) de menor valor.</p>
                )}
              </div>
            )}

            {a.pagamentosInformativos.length > 0 && (
              <div className="evitar-quebra mb-6">
                <Titulo sub="Informados na declaração, mas não reduzem o imposto.">Outros pagamentos informados</Titulo>
                <table className="w-full text-[11.5px]">
                  <tbody>
                    {a.pagamentosInformativos.slice(0, 8).map((p, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="py-0.5 text-slate-500">{p.tipo}</td>
                        <td className="py-0.5 text-slate-800">{p.beneficiario}</td>
                        <td className="py-0.5 text-right tabular-nums">{brl(p.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="evitar-quebra">
              <Titulo>Dependentes</Titulo>
              {r.dependentes.length ? (
                <ul className="grid grid-cols-2 gap-2 text-[12px]">
                  {r.dependentes.map((dp, i) => (
                    <li key={i} className="rounded-lg border border-slate-200 px-3 py-2">
                      <div className="font-medium text-slate-800">{dp.nome}</div>
                      <div className="text-[11px] text-slate-500">
                        {DEPENDENCIA_LABEL[dp.codigo] ?? `código ${dp.codigo}`}
                        {dp.nascimento ? ` · nasc. ${dataBr(dp.nascimento)}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12px] text-slate-600">Nenhum dependente nesta declaração. Se alguém deveria estar aqui, nos avise.</p>
              )}
            </div>
          </Pagina>

          {/* ---------------- Página 4: bens, dados e aprovação ---------------- */}
          <Pagina numero={4} total={totalPaginas}>
            <Cabecalho nome={c.nome} exercicio={d.exercicio} />
            <Titulo sub="Valores pelo custo de aquisição, como a lei exige (não pelo valor de mercado).">Seus bens e direitos</Titulo>
            <table className="mb-4 w-full text-[11px]">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1 font-medium">Bem</th>
                  <th className="py-1 text-right font-medium">31/12/{d.exercicio - 2}</th>
                  <th className="py-1 text-right font-medium">31/12/{d.exercicio - 1}</th>
                </tr>
              </thead>
              <tbody>
                {[...r.bens]
                  .sort((b1, b2) => b2.valorAtual - b1.valorAtual)
                  .map((b, i) => (
                    <tr key={i} className="evitar-quebra border-t border-slate-100 align-top">
                      <td className="py-1 pr-3">
                        <span className="mr-1 rounded px-1 text-[9.5px] font-semibold" style={{ background: "#EEF2F7", color: AZUL }}>
                          {rotuloGrupo(grupoDoBem(b))}
                        </span>
                        {resumirTexto(b.descricao, 110)}
                        {b.valorAnterior === 0 && b.valorAtual > 0 && <span className="ml-1 text-[10px] font-semibold" style={{ color: VERDE }}>novo</span>}
                        {b.valorAnterior > 0 && b.valorAtual === 0 && <span className="ml-1 text-[10px] font-semibold" style={{ color: VERMELHO }}>baixado</span>}
                      </td>
                      <td className="whitespace-nowrap py-1 pl-2 text-right tabular-nums text-slate-500">{brl(b.valorAnterior)}</td>
                      <td className="whitespace-nowrap py-1 pl-2 text-right tabular-nums">{brl(b.valorAtual)}</td>
                    </tr>
                  ))}
                <tr className="border-t-2 border-slate-300 font-semibold" style={{ color: AZUL }}>
                  <td className="py-1">Total</td>
                  <td className="whitespace-nowrap py-1 pl-2 text-right tabular-nums">{brl(t.bensAnterior)}</td>
                  <td className="whitespace-nowrap py-1 pl-2 text-right tabular-nums">{brl(t.bensAtual)}</td>
                </tr>
              </tbody>
            </table>
            {r.dividas.length > 0 && (
              <>
                <Titulo>Dívidas e ônus</Titulo>
                <table className="mb-4 w-full text-[11px]">
                  <tbody>
                    {r.dividas.map((dv, i) => (
                      <tr key={i} className="border-t border-slate-100 align-top">
                        <td className="py-1 pr-3">{resumirTexto(dv.descricao, 110)}</td>
                        <td className="py-1 text-right tabular-nums text-slate-500">{brl(dv.valorAnterior)}</td>
                        <td className="py-1 text-right tabular-nums">{brl(dv.valorAtual)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <div className="evitar-quebra mb-5 rounded-xl border border-slate-200 p-4">
              <Titulo>Seus dados cadastrais</Titulo>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
                {(
                  [
                    ["Endereço", endereco || "—"],
                    ["Cidade / CEP", `${cidade || "—"}${c.cep ? ` · ${c.cep.slice(0, 5)}-${c.cep.slice(5)}` : ""}`],
                    ["E-mail", c.email ?? "—"],
                    ["Celular", fone(c.celular ?? c.telefone)],
                    ["Nascimento", dataBr(c.nascimento)],
                    ["Restituição / débito", contaRestituicao],
                  ] as [string, string][]
                ).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[10.5px] uppercase tracking-wide text-slate-400">{k}</dt>
                    <dd className="text-slate-800">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="evitar-quebra rounded-xl p-4" style={{ background: "#F6F8FB", border: `1px solid ${DOURADO}` }}>
              <div className="text-[14px] font-bold" style={{ color: AZUL }}>
                {transmitida ? "Confira e guarde este resumo" : "Antes de transmitirmos, confira com atenção"}
              </div>
              <ul className="mt-2 grid gap-1 text-[12px] text-slate-700">
                {[
                  "Endereço, e-mail, celular e conta para restituição estão corretos",
                  "Todos os seus dependentes estão listados",
                  "Todas as fontes de renda e informes de bancos e corretoras foram considerados",
                  "Despesas médicas, plano de saúde, escola e previdência estão completos",
                  "Bens comprados ou vendidos no ano e saldos de financiamentos estão certos",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-0.5 inline-block h-3.5 w-3.5 shrink-0 rounded border border-slate-400" />
                    {item}
                  </li>
                ))}
              </ul>
              {!transmitida && (
                <p className="mt-3 text-[12px] text-slate-700">
                  Se estiver tudo certo, responda <b>&quot;De acordo&quot;</b> para transmitirmos. Se algo estiver diferente ou faltando, nos avise
                  antes — o prazo final da Receita é <b>{dataBr(prazo)}</b>.
                </p>
              )}
              <div className="mt-8 grid grid-cols-2 gap-10 text-[11px] text-slate-500">
                <div className="border-t border-slate-400 pt-1">{c.nome}</div>
                <div className="border-t border-slate-400 pt-1">Data</div>
              </div>
            </div>
          </Pagina>
        </>
      )}

      {r.parcial && (
        <Pagina numero={2} total={totalPaginas}>
          <Cabecalho nome={c.nome} exercicio={d.exercicio} />
          <Titulo>Seus dados cadastrais</Titulo>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
            {(
              [
                ["Endereço", endereco || "—"],
                ["E-mail", c.email ?? "—"],
                ["Celular", fone(c.celular ?? c.telefone)],
                ["Restituição / débito", contaRestituicao],
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-[10.5px] uppercase tracking-wide text-slate-400">{k}</dt>
                <dd className="text-slate-800">{v}</dd>
              </div>
            ))}
          </dl>
        </Pagina>
      )}
    </div>
  );
}
