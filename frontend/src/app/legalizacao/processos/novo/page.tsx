import { requirePermissao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listarResponsaveisLegalizacao } from "@/lib/actions/legalizacao-processos";
import { Card } from "@/components/ui/Card";
import { NovoProcessoForm } from "./NovoProcessoForm";

export const metadata = { title: "Novo processo — Legalização" };

export default async function NovoProcessoPage(
  props: PageProps<"/legalizacao/processos/novo">,
) {
  await requirePermissao("legalizacao.editar");
  const searchParams = await props.searchParams;
  const companyIdPreSelecionado = typeof searchParams.companyId === "string" ? searchParams.companyId : undefined;
  const tipoPreSelecionado = typeof searchParams.tipo === "string" ? searchParams.tipo : undefined;

  const supabase = await createClient();
  const [{ data: fluxos }, { data: empresas }, responsaveis] = await Promise.all([
    supabase
      .from("legalizacao_fluxos")
      .select("id, nome, tipo_processo")
      .eq("ativo", true)
      .order("ordem", { ascending: true }),
    supabase
      .from("companies")
      .select("id, legal_name, trade_name, cnpj")
      .eq("ativa", true)
      .order("legal_name", { ascending: true }),
    listarResponsaveisLegalizacao(),
  ]);

  let empresaPreSelecionada = null;
  if (companyIdPreSelecionado) {
    empresaPreSelecionada = (empresas ?? []).find((e) => e.id === companyIdPreSelecionado) ?? null;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">Novo processo</h1>

      <Card className="max-w-2xl p-6 sm:p-8">
        <NovoProcessoForm
          fluxos={fluxos ?? []}
          empresas={empresas ?? []}
          responsaveis={responsaveis}
          tipoPreSelecionado={tipoPreSelecionado}
          empresaPreSelecionada={empresaPreSelecionada}
        />
      </Card>
    </div>
  );
}
