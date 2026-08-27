import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import type { Customer } from "@/lib/types";
import { TomadorForm } from "../TomadorForm";

export const metadata = { title: "Editar tomador — SOMA Gestão" };

export default async function EditTomadorPage(
  props: PageProps<"/empresas/[companyId]/tomadores/[customerId]">,
) {
  const { companyId, customerId } = await props.params;
  const supabase = await createClient();

  const { data: customer } = await supabase
    .from("customers")
    .select(
      "id, company_id, type, cpf_cnpj, name, email, zip_code, address, number, complement, district, city, state",
    )
    .eq("id", customerId)
    .single();

  if (!customer) notFound();

  return (
    <Card className="max-w-lg p-6 sm:p-8">
      <TomadorForm companyId={companyId} customer={customer as Customer} />
    </Card>
  );
}
