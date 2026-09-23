import { requirePermissao } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { TomadorForm } from "@/app/empresas/[companyId]/tomadores/TomadorForm";

export const metadata = { title: "Novo tomador — Painel SOMA" };

export default async function AdminNovoTomadorPage(
  props: PageProps<"/admin/emissao-notas/[companyId]/tomadores/novo">,
) {
  const { companyId } = await props.params;
  await requirePermissao("notas.emitir", companyId);

  const basePath = `/admin/emissao-notas/${companyId}`;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">Novo tomador</h1>
      <Card className="max-w-lg p-6 sm:p-8">
        <TomadorForm companyId={companyId} redirectTo={basePath} cancelHref={basePath} />
      </Card>
    </div>
  );
}
