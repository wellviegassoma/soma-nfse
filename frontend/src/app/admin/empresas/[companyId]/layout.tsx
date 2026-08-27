import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatarDocumentoEmpresa } from "@/lib/formatters";
import { AdminCompanyTabs } from "./AdminCompanyTabs";

export default async function AdminCompanyLayout(
  props: LayoutProps<"/admin/empresas/[companyId]">,
) {
  const { companyId } = await props.params;
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select("id, legal_name, trade_name, cnpj, cpf")
    .eq("id", companyId)
    .single();

  if (!company) notFound();
  const documento = formatarDocumentoEmpresa(company);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          {company.trade_name || company.legal_name}
        </h1>
        <p className="text-sm text-foreground/60">
          {company.legal_name} ·{" "}
          {documento ? `${documento.label}: ${documento.valor}` : "CNPJ/CPF pendente"}
        </p>
      </div>

      <AdminCompanyTabs companyId={companyId} />

      {props.children}
    </div>
  );
}
