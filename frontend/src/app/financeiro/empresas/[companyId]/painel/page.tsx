import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceiroAccess } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { formatarBRL, CATEGORIA_GRUPO_LABELS, type CategoriaGrupo } from "@/lib/financeiro";
import {
  montarPainelCaixa,
  montarPainelCompetencia,
  montarComparativoOrcado,
  type AgendamentoResumo,
  type CategoriaResumo,
  type LancamentoResumo,
  type RateioCategoria,
} from "@/lib/financeiro-relatorios";
import type { CategoriaNatureza } from "@/lib/financeiro";
import { mesCorrenteBrasilia, ultimasCompetencias } from "@/lib/competencia";
import { paginarTudo } from "@/lib/supabase-paginacao";

export const metadata = { title: "Financeiro — Painel de acompanhamento" };

const MESES = 6;

function rotulo(c: string) {
  const [ano, mes] = c.split("-");
  return `${mes}/${ano.slice(2)}`;
}

/** "2026-04" -> "2026-04-30" (o dia 0 do mês seguinte é o último do atual). */
function ultimoDiaDoMes(competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number);
  const dia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${competencia}-${String(dia).padStart(2, "0")}`;
}

function celula(valor: number | undefined) {
  if (!valor) return <span className="text-foreground/30">—</span>;
  return (
    <span className={valor < 0 ? "text-danger" : "text-foreground"}>{formatarBRL(valor)}</span>
  );
}

export default async function PainelPage(
  props: PageProps<"/financeiro/empresas/[companyId]/painel">,
) {
  const { companyId } = await props.params;
  await requireFinanceiroAccess(companyId);

  const searchParams = await props.searchParams;
  const regimeBruto = searchParams.regime;
  const regime =
    regimeBruto === "competencia" || regimeBruto === "orcado" ? regimeBruto : "caixa";
  // O comparativo é de um mês só — orçamento mês a mês numa grade de 6 colunas
  // vira ilegível. Usa o mês corrente, que é sempre o mais recente dos 6
  // meses abaixo — por isso o range de datas que filtra a busca cobre os
  // dois casos com uma consulta só.
  const mesComparativo = mesCorrenteBrasilia();
  // Mais antigo primeiro, pra a tabela ler da esquerda pra direita.
  const competencias = ultimasCompetencias(mesComparativo, MESES).reverse();
  const dataInicio = `${competencias[0]}-01`;
  const dataFim = ultimoDiaDoMes(competencias[competencias.length - 1]);

  const supabase = await createClient();
  const [{ data: company }, { data: categoriasData }, { data: orcamentoData }] =
    await Promise.all([
      supabase
        .from("companies")
        .select("id, legal_name, trade_name")
        .eq("id", companyId)
        .single(),
      supabase
        .from("fin_categorias")
        .select("id, nome, grupo, natureza")
        .eq("company_id", companyId),
      supabase
        .from("fin_orcamento")
        .select("categoria_id, competencia, valor")
        .eq("company_id", companyId),
    ]);

  if (!company) notFound();

  // fin_agendamentos, fin_agendamento_categorias e fin_lancamentos não têm
  // teto por empresa (a SOMA já tem ~7.100/7.230/7.100 de histórico real
  // importado). Duas correções em cima disso, achadas ao vivo com esse
  // volume real:
  // 1) sem paginar, o PostgREST corta em 1000 linhas sem avisar, e o Painel
  //    silenciosamente resumiria só uma fração do histórico;
  // 2) mesmo paginando, buscar TODO o histórico pra usar só os últimos 6
  //    meses levou 26s pra carregar — por isso o filtro de data abaixo, que
  //    reduz o volume trazido ao que a tela realmente mostra.
  type AgendamentoRow = {
    id: string;
    tipo: "RECEBER" | "PAGAR";
    vencimento: string;
    valor_bruto: number;
    status: string;
  };
  type RateioRow = { agendamento_id: string; categoria_id: string; valor: number };
  type LancamentoRow = { agendamento_id: string | null; data: string; valor: number };

  const [agendamentosData, lancamentosData] = await Promise.all([
    paginarTudo<AgendamentoRow>((from, to) =>
      supabase
        .from("fin_agendamentos")
        .select("id, tipo, vencimento, valor_bruto, status")
        .eq("company_id", companyId)
        .gte("vencimento", dataInicio)
        .lte("vencimento", dataFim)
        .range(from, to),
    ),
    paginarTudo<LancamentoRow>((from, to) =>
      supabase
        .from("fin_lancamentos")
        .select("agendamento_id, data, valor")
        .eq("company_id", companyId)
        .gte("data", dataInicio)
        .lte("data", dataFim)
        .range(from, to),
    ),
  ]);

  // O rateio não tem company_id nem data (depende do agendamento) — filtra
  // pelos ids já resolvidos acima, em vez de trazer o rateio de todo o
  // histórico da empresa pra descartar quase tudo depois.
  const idsAgendamentos = agendamentosData.map((a) => a.id);
  const rateiosData: RateioRow[] =
    idsAgendamentos.length === 0
      ? []
      : await paginarTudo<RateioRow>((from, to) =>
          supabase
            .from("fin_agendamento_categorias")
            .select("agendamento_id, categoria_id, valor")
            .in("agendamento_id", idsAgendamentos)
            .range(from, to),
        );

  const categorias = (categoriasData ?? []) as unknown as (CategoriaResumo & {
    natureza: CategoriaNatureza;
  })[];
  const orcamento = ((orcamentoData ?? []) as unknown as {
    categoria_id: string;
    competencia: string;
    valor: number;
  }[]).map((o) => ({
    categoriaId: o.categoria_id,
    competencia: o.competencia,
    valor: Number(o.valor),
  }));
  const agendamentos = agendamentosData.map<AgendamentoResumo>((a) => ({
    id: a.id,
    tipo: a.tipo,
    vencimento: a.vencimento,
    valorBruto: Number(a.valor_bruto),
    status: a.status,
  }));
  const rateios = rateiosData.map<RateioCategoria>((r) => ({
    agendamentoId: r.agendamento_id,
    categoriaId: r.categoria_id,
    valor: Number(r.valor),
  }));
  const lancamentos = lancamentosData.map<LancamentoResumo>((l) => ({
    agendamentoId: l.agendamento_id,
    data: l.data,
    valor: Number(l.valor),
  }));

  const painel =
    regime === "competencia"
      ? montarPainelCompetencia(agendamentos, rateios, categorias, competencias)
      : montarPainelCaixa(lancamentos, agendamentos, rateios, categorias, competencias);

  // O comparativo usa sempre o regime de CAIXA: comparar orçamento com
  // competência misturaria "o que planejei gastar" com "o que devo mas ainda
  // não paguei", e o mês fecharia estourado sem o dinheiro ter saído.
  const comparativo =
    regime === "orcado"
      ? montarComparativoOrcado(
          montarPainelCaixa(lancamentos, agendamentos, rateios, categorias, [mesComparativo]),
          orcamento,
          categorias,
          mesComparativo,
        )
      : null;

  const base = `/financeiro/empresas/${companyId}/painel`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/financeiro/empresas/${companyId}`}
          className="text-sm text-foreground/55 hover:text-foreground"
        >
          ← {company.trade_name || company.legal_name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          Painel de acompanhamento
        </h1>
        <p className="mt-1 text-sm text-foreground/60">
          Últimos {MESES} meses por categoria. Valor negativo é saída de dinheiro.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {(
          [
            ["caixa", "Caixa", "quando o dinheiro se moveu"],
            ["competencia", "Competência", "quando a conta venceu"],
            ["orcado", "Realizado × Orçado", "o mês corrente contra o planejado"],
          ] as const
        ).map(([valor, texto, dica]) => (
          <Link
            key={valor}
            href={valor === "caixa" ? base : `${base}?regime=${valor}`}
            title={dica}
            className={`border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              regime === valor
                ? "border-brand text-brand"
                : "border-transparent text-foreground/55 hover:text-foreground"
            }`}
          >
            {texto}
          </Link>
        ))}
      </div>

      <p className="-mt-3 text-xs text-foreground/55">
        {regime === "caixa" &&
          "Regime de caixa: cada valor entra no mês em que o dinheiro entrou ou saiu da conta. Baixa parcial é rateada entre as categorias na mesma proporção do lançamento. Transferência entre contas próprias fica de fora."}
        {regime === "competencia" &&
          "Regime de competência: cada valor entra no mês do vencimento, pago ou não. Agendamento cancelado fica de fora."}
        {regime === "orcado" &&
          "Realizado (pelo caixa) contra o orçado do mês corrente. Variação positiva é a favor nos dois sentidos: receita acima do previsto ou despesa abaixo dele."}
      </p>

      {comparativo ? (
        comparativo.linhas.length === 0 ? (
          <Card className="p-8 text-center text-sm text-foreground/55">
            Nada orçado nem realizado em {mesComparativo}. Defina o orçamento em{" "}
            <Link
              href={`/financeiro/empresas/${companyId}/orcamento`}
              className="text-brand hover:underline"
            >
              Orçamento
            </Link>
            .
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/50">
                  <th className="px-5 py-3 text-left font-medium">Categoria</th>
                  <th className="px-4 py-3 text-right font-medium">Orçado</th>
                  <th className="px-4 py-3 text-right font-medium">Realizado</th>
                  <th className="px-5 py-3 text-right font-medium">Variação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {comparativo.linhas.map((l) => (
                  <tr key={l.categoriaId}>
                    <td className="px-5 py-2.5 text-foreground/80">{l.nome}</td>
                    <td className="px-4 py-2.5 text-right">{celula(l.orcado)}</td>
                    <td className="px-4 py-2.5 text-right">{celula(l.realizado)}</td>
                    <td
                      className={`px-5 py-2.5 text-right font-medium ${
                        l.favoravel ? "text-success" : "text-danger"
                      }`}
                    >
                      {l.variacao > 0 ? "+" : ""}
                      {formatarBRL(l.variacao)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border">
                  <td className="px-5 py-3 font-semibold text-foreground">Resultado</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {celula(comparativo.orcado)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {celula(comparativo.realizado)}
                  </td>
                  <td
                    className={`px-5 py-3 text-right font-semibold ${
                      comparativo.variacao >= 0 ? "text-success" : "text-danger"
                    }`}
                  >
                    {comparativo.variacao > 0 ? "+" : ""}
                    {formatarBRL(comparativo.variacao)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </Card>
        )
      ) : painel.grupos.length === 0 ? (
        <Card className="p-8 text-center text-sm text-foreground/55">
          Nenhum movimento no período.
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/50">
                <th className="px-5 py-3 text-left font-medium">Categoria</th>
                {competencias.map((c) => (
                  <th key={c} className="px-4 py-3 text-right font-medium">
                    {rotulo(c)}
                  </th>
                ))}
                <th className="px-5 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            {/* Um <tbody> por grupo, irmãos de <thead>/<tfoot> — tbody aninhado
                e tfoot dentro de tbody são HTML inválido. */}
            {painel.grupos.map((g) => (
                <tbody key={g.grupo} className="divide-y divide-border">
                  <tr className="bg-surface-muted/60">
                    <td className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-foreground/70">
                      {CATEGORIA_GRUPO_LABELS[g.grupo as CategoriaGrupo] ?? g.grupo}
                    </td>
                    {competencias.map((c) => (
                      <td key={c} className="px-4 py-2.5 text-right text-xs font-semibold">
                        {celula(g.porCompetencia[c])}
                      </td>
                    ))}
                    <td className="px-5 py-2.5 text-right text-xs font-semibold">
                      {celula(g.total)}
                    </td>
                  </tr>
                  {g.linhas.map((l) => (
                    <tr key={l.categoriaId}>
                      <td className="px-5 py-2.5 pl-8 text-foreground/80">{l.nome}</td>
                      {competencias.map((c) => (
                        <td key={c} className="px-4 py-2.5 text-right">
                          {celula(l.porCompetencia[c])}
                        </td>
                      ))}
                      <td className="px-5 py-2.5 text-right font-medium">{celula(l.total)}</td>
                    </tr>
                  ))}
                </tbody>
            ))}
            <tfoot>
              <tr className="border-t-2 border-border">
                <td className="px-5 py-3 text-sm font-semibold text-foreground">Resultado</td>
                {competencias.map((c) => (
                  <td key={c} className="px-4 py-3 text-right font-semibold">
                    {celula(painel.totalPorCompetencia[c])}
                  </td>
                ))}
                <td className="px-5 py-3 text-right font-semibold">{celula(painel.total)}</td>
              </tr>
            </tfoot>
          </table>
        </Card>
      )}
    </div>
  );
}
