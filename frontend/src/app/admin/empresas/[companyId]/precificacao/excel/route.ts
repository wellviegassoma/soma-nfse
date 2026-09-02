import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePrecificacaoAccess } from "@/lib/auth";
import { gerarExcelPrecificacao } from "@/lib/precificacao/excel-export";

export async function GET(
  _request: Request,
  props: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await props.params;
  await requirePrecificacaoAccess(companyId);

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("legal_name, trade_name")
    .eq("id", companyId)
    .single();
  const nomeEmpresa = company?.trade_name || company?.legal_name || "Empresa";

  const buffer = await gerarExcelPrecificacao(supabase, companyId, nomeEmpresa);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="precificacao-${nomeEmpresa.replace(/[^a-zA-Z0-9]+/g, "-")}.xlsx"`,
    },
  });
}
