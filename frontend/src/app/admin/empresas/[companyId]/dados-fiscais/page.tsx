import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { Company } from "@/lib/types";
import { FiscalForm } from "./FiscalForm";
import { CompanyNameForm } from "./CompanyNameForm";
import { StatusSomaForm } from "./StatusSomaForm";

export const metadata = { title: "Dados fiscais — Painel SOMA" };

export default async function AdminCompanyFiscalPage(
  props: PageProps<"/admin/empresas/[companyId]/dados-fiscais">,
) {
  const { companyId } = await props.params;
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select(
      "id, organization_id, person_type, cnpj, cpf, legal_name, trade_name, codigo_cliente, created_at, municipal_registration, data_abertura, tax_regime, cnae, municipality_ibge_code, nfse_ambiente, dps_series, dps_next_number, regime_especial_tributacao, allow_retroactive_emission, sujeito_fator_r, irpj_csll_apuracao_mensal, iss_aliquota_padrao, iss_tipo, iss_valor_fixo_profissional, iss_quantidade_profissionais, ativa, data_encerramento_soma",
    )
    .eq("id", companyId)
    .single();

  if (!company) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <a href={`/admin/empresas/${company.id}/planilha`}>
          <Button type="button" variant="secondary">
            Baixar dados da empresa (planilha)
          </Button>
        </a>
      </div>
      <Card className="max-w-2xl p-6 sm:p-8">
        <CompanyNameForm
          companyId={company.id}
          legalName={company.legal_name}
          tradeName={company.trade_name}
          codigoCliente={company.codigo_cliente}
        />
      </Card>
      <Card className="max-w-2xl p-6 sm:p-8">
        <FiscalForm company={company as Company} />
      </Card>
      <Card className="max-w-2xl p-6 sm:p-8">
        <StatusSomaForm
          companyId={company.id}
          ativa={company.ativa}
          dataEncerramentoSoma={company.data_encerramento_soma}
        />
      </Card>
    </div>
  );
}
