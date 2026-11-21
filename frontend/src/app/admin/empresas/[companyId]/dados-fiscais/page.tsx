import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { Company } from "@/lib/types";
import { FiscalForm } from "./FiscalForm";
import { CompanyNameForm } from "./CompanyNameForm";
import { StatusSomaForm } from "./StatusSomaForm";
import { GruposWhatsappForm, type GrupoVinculado } from "./GruposWhatsappForm";

export const metadata = { title: "Dados fiscais — Painel SOMA" };

export default async function AdminCompanyFiscalPage(
  props: PageProps<"/admin/empresas/[companyId]/dados-fiscais">,
) {
  const { companyId } = await props.params;
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select(
      "id, organization_id, person_type, cnpj, cpf, legal_name, trade_name, codigo_cliente, created_at, municipal_registration, inscricao_estadual, data_abertura, tax_regime, cnae, municipality_ibge_code, municipality_name, state, address_street, address_number, address_complement, address_neighborhood, address_zip, petropolis_cmc, nfse_ambiente, dps_series, dps_next_number, regime_especial_tributacao, allow_retroactive_emission, sujeito_fator_r, irpj_csll_apuracao_mensal, equiparacao_hospitalar, iss_aliquota_padrao, iss_tipo, iss_valor_fixo_profissional, iss_quantidade_profissionais, ativa, data_encerramento_soma",
    )
    .eq("id", companyId)
    .single();

  if (!company) notFound();

  // Grupos do WhatsApp (Digisac) desta empresa + outras empresas no mesmo grupo.
  const { data: vinculos } = await supabase
    .from("pedido_nota_vinculos")
    .select("id, origem_contact_id, grupo_nome, fonte")
    .eq("company_id", companyId)
    .order("created_at");
  const contatos = (vinculos ?? []).map((v) => v.origem_contact_id as string);
  const { data: outros } = contatos.length
    ? await supabase
        .from("pedido_nota_vinculos")
        .select("origem_contact_id, company:companies(legal_name, trade_name)")
        .in("origem_contact_id", contatos)
        .neq("company_id", companyId)
    : { data: [] };
  const gruposVinculados: GrupoVinculado[] = (vinculos ?? []).map((v) => ({
    id: v.id as string,
    contactId: v.origem_contact_id as string,
    nome: (v.grupo_nome as string | null) ?? null,
    fonte: v.fonte as string,
    outrasEmpresas: (outros ?? [])
      .filter((o) => o.origem_contact_id === v.origem_contact_id)
      .map((o) => {
        const c = Array.isArray(o.company) ? o.company[0] : o.company;
        return (c?.trade_name || c?.legal_name || "?") as string;
      }),
  }));

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
        <GruposWhatsappForm companyId={company.id} vinculados={gruposVinculados} />
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
