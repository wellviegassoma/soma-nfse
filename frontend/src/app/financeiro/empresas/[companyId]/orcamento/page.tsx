import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceiroAccess } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import {
  CATEGORIA_GRUPO_LABELS,
  type CategoriaGrupo,
  type CategoriaNatureza,
} from "@/lib/financeiro";
import { mesCorrenteBrasilia } from "@/lib/competencia";
import { OrcamentoForm } from "@/components/financeiro/OrcamentoForm";

export const metadata = { title: "Financeiro — Orçamento" };

function competenciaValida(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

function somarCompetencia(c: string, n: number): string {
  const [ano, mes] = c.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function OrcamentoPage(
  props: PageProps<"/financeiro/empresas/[companyId]/orcamento">,
) {
  const { companyId } = await props.params;
  await requireFinanceiroAccess(companyId);

  const searchParams = await props.searchParams;
  const competencia = competenciaValida(searchParams.competencia)
    ? searchParams.competencia
    : mesCorrenteBrasilia();

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
        .select("id, nome, grupo, natureza, sistema, ativo")
        .eq("company_id", companyId)
        .eq("ativo", true)
        .order("ordem"),
      supabase
        .from("fin_orcamento")
        .select("categoria_id, valor")
        .eq("company_id", companyId)
        .eq("competencia", competencia),
    ]);

  if (!company) notFound();

  type Cat = {
    id: string;
    nome: string;
    grupo: CategoriaGrupo;
    natureza: CategoriaNatureza;
    sistema: boolean;
  };

  // Categoria de sistema (juros, multa, desconto, retenção) não se orça: ela é
  // consequência de um lançamento, não uma decisão de gasto.
  const categorias = ((categoriasData ?? []) as unknown as Cat[]).filter((c) => !c.sistema);
  const orcamento = (orcamentoData ?? []) as unknown as {
    categoria_id: string;
    valor: number;
  }[];
  const valorPorCategoria = new Map(orcamento.map((o) => [o.categoria_id, Number(o.valor)]));

  const grupos = (
    [
      "RECEITA_OPERACIONAL",
      "CUSTO_DESPESA_OPERACIONAL",
      "INVESTIMENTO",
      "FINANCIAMENTO",
    ] as CategoriaGrupo[]
  )
    .map((grupo) => ({
      grupo,
      rotulo: CATEGORIA_GRUPO_LABELS[grupo],
      categorias: categorias
        .filter((c) => c.grupo === grupo)
        .map((c) => ({
          id: c.id,
          nome: c.nome,
          valor: valorPorCategoria.get(c.id) ?? null,
        })),
    }))
    .filter((g) => g.categorias.length > 0);

  const base = `/financeiro/empresas/${companyId}/orcamento`;
  const anterior = somarCompetencia(competencia, -1);
  const proxima = somarCompetencia(competencia, 1);
  const [ano, mes] = competencia.split("-");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/financeiro/empresas/${companyId}`}
          className="text-sm text-foreground/55 hover:text-foreground"
        >
          ← {company.trade_name || company.legal_name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Orçamento</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Quanto se espera receber e gastar em cada categoria. Digite sempre valor positivo —
          o sentido vem da própria categoria. Compare com o realizado no{" "}
          <Link
            href={`/financeiro/empresas/${companyId}/painel?regime=orcado`}
            className="text-brand hover:underline"
          >
            Painel de acompanhamento
          </Link>
          .
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Link
          href={`${base}?competencia=${anterior}`}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-muted"
        >
          ← {anterior}
        </Link>
        <span className="text-lg font-semibold text-foreground">
          {mes}/{ano}
        </span>
        <Link
          href={`${base}?competencia=${proxima}`}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-muted"
        >
          {proxima} →
        </Link>
      </div>

      {grupos.length === 0 ? (
        <Card className="p-8 text-center text-sm text-foreground/55">
          Nenhuma categoria ativa para orçar.
        </Card>
      ) : (
        <OrcamentoForm
          companyId={companyId}
          competencia={competencia}
          anterior={anterior}
          grupos={grupos}
        />
      )}
    </div>
  );
}
