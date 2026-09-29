import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";
import { gerarExcelDadosEmpresa } from "@/lib/empresa-export";
import type { Company } from "@/lib/types";

export async function GET(
  _request: Request,
  props: { params: Promise<{ companyId: string }> },
) {
  await requireSomaStaff();

  const { companyId } = await props.params;
  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select(
      "id, organization_id, person_type, cnpj, cpf, legal_name, trade_name, codigo_cliente, created_at, municipal_registration, data_abertura, tax_regime, cnae, municipality_ibge_code, municipality_name, state, address_street, address_number, address_complement, address_neighborhood, address_zip, nfse_ambiente, dps_series, dps_next_number, regime_especial_tributacao, allow_retroactive_emission, sujeito_fator_r, irpj_csll_apuracao_mensal, iss_aliquota_padrao, iss_tipo, iss_valor_fixo_profissional, iss_quantidade_profissionais, ativa, data_encerramento_soma",
    )
    .eq("id", companyId)
    .single();

  if (!company) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const buffer = await gerarExcelDadosEmpresa(company as Company);
  const nomeArquivo = (company.trade_name || company.legal_name).replace(/[^a-zA-Z0-9]+/g, "-");

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="empresa-${nomeArquivo}.xlsx"`,
    },
  });
}
