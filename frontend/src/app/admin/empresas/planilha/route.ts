import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";
import { gerarExcelListaEmpresas } from "@/lib/empresa-export";
import { faturamentoDoMesPorEmpresa } from "@/lib/faturamento-mes-empresas";
import { mesAnteriorBrasilia } from "@/lib/competencia";

export async function GET(request: Request) {
  await requireSomaStaff();

  const searchParams = new URL(request.url).searchParams;
  const q = (searchParams.get("q") ?? "").trim();
  const mostrarInativas = searchParams.get("inativas") === "1";

  const supabase = await createClient();
  let query = supabase
    .from("companies")
    .select(
      "id, codigo_cliente, legal_name, trade_name, person_type, cnpj, cpf, ativa, tax_regime, cnae, municipality_name, municipality_ibge_code, state, address_street, address_number, address_complement, address_neighborhood, address_zip, municipal_registration, data_abertura, regime_especial_tributacao, sujeito_fator_r, irpj_csll_apuracao_mensal, equiparacao_hospitalar, iss_tipo, iss_aliquota_padrao, iss_valor_fixo_profissional, iss_quantidade_profissionais, nfse_ambiente, dps_series, dps_next_number, allow_retroactive_emission, created_at, certificates(expires_at)",
    )
    .order("legal_name", { ascending: true });

  if (!mostrarInativas) query = query.eq("ativa", true);

  if (q) {
    const termoSeguro = q.replace(/[,()]/g, " ").trim();
    const digits = q.replace(/\D/g, "");
    const termos = [
      `legal_name.ilike.%${termoSeguro}%`,
      `trade_name.ilike.%${termoSeguro}%`,
      `codigo_cliente.ilike.%${termoSeguro}%`,
    ];
    if (digits) termos.push(`cnpj.ilike.%${digits}%`, `cpf.ilike.%${digits}%`);
    if (termoSeguro || digits) query = query.or(termos.join(","));
  }

  const { data: empresas, error } = await query;
  if (error) return NextResponse.json({ error: "Não foi possível buscar as empresas." }, { status: 500 });

  // Mês anterior ao corrente (em Brasília) — o último fechado.
  const competenciaAnterior = mesAnteriorBrasilia();
  const faturamentoPorEmpresa = await faturamentoDoMesPorEmpresa(supabase, competenciaAnterior);

  const buffer = await gerarExcelListaEmpresas(empresas ?? [], {
    competencia: competenciaAnterior,
    faturamentoPorEmpresa,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="empresas.xlsx"',
    },
  });
}
