import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceiroAccess } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import {
  CATEGORIA_GRUPOS,
  CATEGORIA_GRUPO_LABELS,
  type FinCategoria,
  type FinCentroCusto,
} from "@/lib/financeiro";
import { CategoriaForm } from "./CategoriaForm";
import { CentroCustoForm } from "./CentroCustoForm";
import { ToggleCategoriaButton } from "./ToggleCategoriaButton";
import { ToggleCentroCustoButton } from "./ToggleCentroCustoButton";

export const metadata = { title: "Financeiro — Categorias e centros de custo" };

export default async function FinanceiroConfigPage(
  props: PageProps<"/financeiro/empresas/[companyId]/config">,
) {
  const { companyId } = await props.params;
  await requireFinanceiroAccess(companyId);

  const supabase = await createClient();
  const [{ data: company }, { data: categoriasData }, { data: centrosData }] =
    await Promise.all([
      supabase
        .from("companies")
        .select("id, legal_name, trade_name")
        .eq("id", companyId)
        .single(),
      supabase
        .from("fin_categorias")
        .select(
          "id, company_id, grupo, nome, natureza, sistema, codigo_sistema, conta_contabil, ordem, ativo",
        )
        .eq("company_id", companyId)
        .order("ordem", { ascending: true }),
      supabase
        .from("fin_centros_custo")
        .select("id, company_id, nome, ativo")
        .eq("company_id", companyId)
        .order("nome", { ascending: true }),
    ]);

  if (!company) notFound();
  const categorias = (categoriasData ?? []) as unknown as FinCategoria[];
  const centros = (centrosData ?? []) as unknown as FinCentroCusto[];

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
          Categorias e centros de custo
        </h1>
        <p className="mt-1 text-sm text-foreground/60">
          O plano de categorias é desta empresa e segue a estrutura da DFC. Categorias de
          sistema (juros, multa, desconto e retenções) não podem ser desativadas — o cálculo
          do lançamento precisa delas para saber onde jogar o valor.
        </p>
      </div>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Nova categoria</h2>
        <CategoriaForm companyId={companyId} />
      </Card>

      {CATEGORIA_GRUPOS.map((grupo) => {
        const doGrupo = categorias.filter((c) => c.grupo === grupo);
        if (doGrupo.length === 0) return null;
        return (
          <Card key={grupo}>
            <div className="border-b border-border px-5 py-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground/60">
                {CATEGORIA_GRUPO_LABELS[grupo]}
              </h2>
            </div>
            <ul className="divide-y divide-border">
              {doGrupo.map((cat) => (
                <li key={cat.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={
                        cat.natureza === "ENTRADA"
                          ? "text-success"
                          : "text-danger"
                      }
                      aria-label={cat.natureza === "ENTRADA" ? "Entrada" : "Saída"}
                    >
                      {cat.natureza === "ENTRADA" ? "↑" : "↓"}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">
                        {cat.nome}
                        {cat.sistema && (
                          <span className="ml-2 text-xs text-foreground/40">sistema</span>
                        )}
                        {!cat.ativo && (
                          <span className="ml-2 text-xs text-foreground/40">inativa</span>
                        )}
                      </p>
                      {cat.conta_contabil && (
                        <p className="text-xs text-foreground/45">
                          conta contábil {cat.conta_contabil}
                        </p>
                      )}
                    </div>
                  </div>
                  {!cat.sistema && (
                    <ToggleCategoriaButton
                      companyId={companyId}
                      categoriaId={cat.id}
                      ativo={cat.ativo}
                    />
                  )}
                </li>
              ))}
            </ul>
          </Card>
        );
      })}

      <Card>
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Centros de custo</h2>
          <p className="mt-0.5 text-xs text-foreground/55">
            Lista simples, sem hierarquia. Usados no rateio do lançamento, por percentual ou
            por valor.
          </p>
        </div>
        <div className="px-5 py-4">
          <CentroCustoForm companyId={companyId} />
        </div>
        {centros.length > 0 && (
          <ul className="divide-y divide-border border-t border-border">
            {centros.map((centro) => (
              <li
                key={centro.id}
                className="flex items-center justify-between gap-4 px-5 py-3"
              >
                <p className="truncate text-sm text-foreground">
                  {centro.nome}
                  {!centro.ativo && (
                    <span className="ml-2 text-xs text-foreground/40">inativo</span>
                  )}
                </p>
                <ToggleCentroCustoButton
                  companyId={companyId}
                  centroId={centro.id}
                  ativo={centro.ativo}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
