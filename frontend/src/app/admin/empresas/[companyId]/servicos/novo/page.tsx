import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { ServiceForm } from "../ServiceForm";
import { fetchServiceFormContext } from "../suggestions";

export const metadata = { title: "Novo serviço — Painel SOMA" };

export default async function NewServicePage(
  props: PageProps<"/admin/empresas/[companyId]/servicos/novo">,
) {
  const { companyId } = await props.params;
  const supabase = await createClient();
  const context = await fetchServiceFormContext(supabase, companyId);
  return (
    <Card className="max-w-2xl p-6 sm:p-8">
      <ServiceForm companyId={companyId} context={context} />
    </Card>
  );
}
