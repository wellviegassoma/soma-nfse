import { Card } from "@/components/ui/Card";
import { ServiceForm } from "../ServiceForm";

export const metadata = { title: "Novo serviço — Painel SOMA" };

export default async function NewServicePage(
  props: PageProps<"/admin/empresas/[companyId]/servicos/novo">,
) {
  const { companyId } = await props.params;
  return (
    <Card className="max-w-2xl p-6 sm:p-8">
      <ServiceForm companyId={companyId} />
    </Card>
  );
}
