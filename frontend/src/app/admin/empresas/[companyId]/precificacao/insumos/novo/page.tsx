import { Card } from "@/components/ui/Card";
import { requirePrecificacaoAccess } from "@/lib/auth";
import { InsumoForm } from "@/components/precificacao/InsumoForm";

export const metadata = { title: "Novo insumo — Painel SOMA" };

export default async function NewInsumoPage(
  props: PageProps<"/admin/empresas/[companyId]/precificacao/insumos/novo">,
) {
  const { companyId } = await props.params;
  await requirePrecificacaoAccess(companyId);
  const basePath = `/admin/empresas/${companyId}/precificacao`;

  return (
    <Card className="max-w-xl p-6 sm:p-8">
      <InsumoForm companyId={companyId} basePath={basePath} />
    </Card>
  );
}
