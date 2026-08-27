import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import type { Service } from "@/lib/types";
import { ServiceForm } from "../ServiceForm";
import { fetchServiceCodeSuggestions } from "../suggestions";

export const metadata = { title: "Editar serviço — Painel SOMA" };

export default async function EditServicePage(
  props: PageProps<"/admin/empresas/[companyId]/servicos/[serviceId]">,
) {
  const { companyId, serviceId } = await props.params;
  const supabase = await createClient();

  const [{ data: service }, suggestions] = await Promise.all([
    supabase
      .from("services")
      .select(
        "id, company_id, name, description, national_tax_code, municipal_tax_code, nbs, iss_rate, percentual_total_tributos_federal, percentual_total_tributos_estadual, percentual_total_tributos_municipal, cst_pis_cofins, aliquota_pis, aliquota_cofins, retencao_pis_cofins_csll_aliquota, retencao_irrf_aliquota, tipo_retencao_issqn, active, atividade_simples_nacional",
      )
      .eq("id", serviceId)
      .single(),
    fetchServiceCodeSuggestions(supabase),
  ]);

  if (!service) notFound();

  return (
    <Card className="max-w-2xl p-6 sm:p-8">
      <ServiceForm companyId={companyId} service={service as Service} suggestions={suggestions} />
    </Card>
  );
}
