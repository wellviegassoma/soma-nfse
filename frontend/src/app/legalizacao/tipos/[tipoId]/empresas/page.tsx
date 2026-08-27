import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { tipoAplicavel } from "@/app/legalizacao/status";
import { SelecionarEmpresasForm } from "./SelecionarEmpresasForm";

export const metadata = { title: "Legalização — Empresas do tipo" };

export default async function TipoEmpresasPage(
  props: PageProps<"/legalizacao/tipos/[tipoId]/empresas">,
) {
  const { tipoId } = await props.params;
  const supabase = await createClient();

  const [{ data: tipo }, { data: empresas }, { data: excecoes }] = await Promise.all([
    supabase
      .from("legalizacao_tipos_documento")
      .select("id, nome, aplica_a_todas")
      .eq("id", tipoId)
      .single(),
    supabase.from("companies").select("id, legal_name, trade_name").order("legal_name", { ascending: true }),
    supabase.from("legalizacao_tipos_empresas_excecao").select("company_id, aplicavel").eq("tipo_id", tipoId),
  ]);

  if (!tipo) notFound();

  const excecaoPorEmpresa = new Map((excecoes ?? []).map((r) => [r.company_id, r.aplicavel]));
  const empresasAplicaveisIds = (empresas ?? [])
    .filter((e) => tipoAplicavel(tipo.aplica_a_todas, excecaoPorEmpresa.get(e.id)))
    .map((e) => e.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/legalizacao/tipos" className="text-xs text-brand underline">
          ← Voltar para tipos de documento
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-foreground">{tipo.nome}</h1>
        <p className="text-sm text-foreground/60">
          {tipo.aplica_a_todas
            ? "Esse tipo se aplica a todas as empresas por padrão — desmarque as que não precisam dele."
            : "Esse tipo é restrito — marque só as empresas que precisam dele."}
        </p>
      </div>

      <Card className="overflow-hidden">
        <SelecionarEmpresasForm
          tipoId={tipoId}
          empresas={(empresas ?? []).map((e) => ({
            id: e.id,
            nome: e.trade_name || e.legal_name,
          }))}
          empresasAplicaveisIds={empresasAplicaveisIds}
        />
      </Card>
    </div>
  );
}
