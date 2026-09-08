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

export const metadata = { title: "Financeiro — Painel de acompanhamento" };

const MESES = 6;

function rotulo(c: string) {
  const [ano, mes] = c.split("-");
  return `${mes}/${ano.slice(2)}`;
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
  // vira ilegível. Usa o mês corrente.
  const mesComparativo = mesCorrenteBrasilia();

  const supabase = await createClient();
  const [
    { data: company },
    { data: categoriasData },
    { data: agendamentosData },
    { data: rateiosData },
    { data: lancamentosData },
    { data: orcamentoData },
  ] = await Promise.all([
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
      .from("fin_agendamentos")
      .select("id, tipo, vencimento, valor_bruto, status")
      .eq("company_id", companyId),
    // O rateio não tem company_id (depende do agendamento), então o filtro vem
    // pela RLS, que já corta por empresa via o pai.
    supabase.from("fin_agendamento_categorias").select("agendamento_id, categoria_id, valor"),
    supabase
      .from("fin_lancamentos")
      .select("agendamento_id, data, valor")
      .eq("company_id", companyId),
    supabase
      .from("fin_orcamento")
      .select("categoria_id, competencia, valor")
      .eq("company_id", companyId),
  ]);

  if (!company) notFound();

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
  const agendamentos = ((agendamentosData ?? []) as unknown as {
    id: string;
    tipo: "RECEBER" | "PAGAR";
    vencimento: string;
    valor_bruto: number;
    status: string;
  }[]).map<AgendamentoResumo>((a) => ({
    id: a.id,
    tipo: a.tipo,
    vencimento: a.vencimento,
    valorBruto: Number(a.valor_bruto),
    status: a.status,
  }));
  const rateios = ((rateiosData ?? []) as unknown as {
    agendamento_id: string;
    categoria_id: string;
    valor: number;
  }[]).map<RateioCategoria>((r) => ({
    agendamentoId: r.agendamento_id,
    categoriaId: r.categoria_id,
    valor: Number(r.valor),
  }));
  const lancamentos = ((lancamentosData ?? []) as unknown as {
    agendamento_id: string | null;
    data: string;
    valor: number;
  }[]).map<LancamentoResumo>((l) => ({
    agendamentoId: l.agendamento_id,
    data: l.data,
    valor: Number(l.valor),
  }));

  // Mais antigo primeiro, pra a tabela ler da esquerda pra direita.
  const competencias = ultimasCompetencias(mesCorrenteBrasilia(), MESES).reverse();

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
