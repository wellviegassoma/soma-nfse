import { Card } from "@/components/ui/Card";
import { TomadorForm } from "../TomadorForm";

export const metadata = { title: "Novo tomador — SOMA Gestão" };

export default async function NewTomadorPage(
  props: PageProps<"/empresas/[companyId]/tomadores/novo">,
) {
  const { companyId } = await props.params;
  return (
    <Card className="max-w-lg p-6 sm:p-8">
      <TomadorForm companyId={companyId} />
    </Card>
  );
}
