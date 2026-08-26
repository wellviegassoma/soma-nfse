import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import type { Company } from "@/lib/types";
import { FiscalForm } from "./FiscalForm";
import { CompanyNameForm } from "./CompanyNameForm";

export const metadata = { title: "Dados fiscais — Painel SOMA" };

export default async function AdminCompanyFiscalPage(
  props: PageProps<"/admin/empresas/[companyId]/dados-fiscais">,
) {
  const { companyId } = await props.params;
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select(
      "id, organization_id, cnpj, legal_name, trade_name, created_at, municipal_registration, data_abertura, tax_regime, cnae, municipality_ibge_code, nfse_ambiente, dps_series, dps_next_number, regime_especial_tributacao, allow_retroactive_emission, sujeito_fator_r, rbt12_manual, rbt12_manual_competencia, irpj_csll_apuracao_mensal, iss_aliquota_padrao",
    )
    .eq("id", companyId)
    .single();

  if (!company) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Card className="max-w-2xl p-6 sm:p-8">
        <CompanyNameForm
          companyId={company.id}
          legalName={company.legal_name}
          tradeName={company.trade_name}
        />
      </Card>
      <Card className="max-w-2xl p-6 sm:p-8">
        <FiscalForm company={company as Company} />
      </Card>
    </div>
  );
}
