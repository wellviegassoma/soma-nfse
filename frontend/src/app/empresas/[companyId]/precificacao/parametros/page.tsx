import { createClient } from "@/lib/supabase/server";
import { requirePrecificacaoAccess } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { ParametrosForm } from "@/components/precificacao/ParametrosForm";
import { CustosFixosManager } from "@/components/precificacao/CustosFixosManager";
import { buscarCustosFixos, buscarParametros } from "@/lib/precificacao/queries";

export const metadata = { title: "Parâmetros de precificação" };

export default async function PrecificacaoParametrosPage(
  props: PageProps<"/empresas/[companyId]/precificacao/parametros">,
) {
  const { companyId } = await props.params;
  await requirePrecificacaoAccess(companyId);
  const supabase = await createClient();
  const basePath = `/empresas/${companyId}/precificacao`;

  const [parametros, custosFixos] = await Promise.all([
    buscarParametros(supabase, companyId),
    buscarCustosFixos(supabase, companyId),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <Card className="max-w-xl p-6 sm:p-8">
        <h2 className="mb-5 text-sm font-semibold text-foreground/70">
          Carga horária e alíquotas
        </h2>
        <ParametrosForm companyId={companyId} basePath={basePath} parametros={parametros ?? undefined} />
      </Card>

      <div>
        <h2 className="mb-4 text-sm font-semibold text-foreground/70">Custos fixos mensais</h2>
        <CustosFixosManager companyId={companyId} basePath={basePath} custosFixos={custosFixos} />
      </div>
    </div>
  );
}
