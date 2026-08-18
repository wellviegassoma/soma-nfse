import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import type { Service } from "@/lib/types";
import { ServiceForm } from "../ServiceForm";

export const metadata = { title: "Editar serviço — Painel SOMA" };

export default async function EditServicePage(
  props: PageProps<"/admin/empresas/[companyId]/servicos/[serviceId]">,
) {
  const { companyId, serviceId } = await props.params;
  const supabase = await createClient();

  const { data: service } = await supabase
    .from("services")
    .select(
      "id, company_id, name, description, national_tax_code, municipal_tax_code, nbs, iss_rate, taxation_type, active",
    )
    .eq("id", serviceId)
    .single();

  if (!service) notFound();

  return (
    <Card className="max-w-2xl p-6 sm:p-8">
      <ServiceForm companyId={companyId} service={service as Service} />
    </Card>
  );
}
