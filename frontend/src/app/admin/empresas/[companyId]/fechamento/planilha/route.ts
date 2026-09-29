import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";
import { gerarPlanilhaNotasDaEmpresa } from "@/lib/fechamento-export";

const COMPETENCIA_REGEX = /^\d{4}-\d{2}$/;

export async function GET(
  request: Request,
  props: { params: Promise<{ companyId: string }> },
) {
  await requireSomaStaff();

  const { companyId } = await props.params;
  const competencia = new URL(request.url).searchParams.get("competencia");
  if (!competencia || !COMPETENCIA_REGEX.test(competencia)) {
    return NextResponse.json({ error: "Competência inválida." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("legal_name, trade_name")
    .eq("id", companyId)
    .single();
  if (!company) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const buffer = await gerarPlanilhaNotasDaEmpresa(supabase, companyId, competencia);
  const nomeEmpresa = (company.trade_name || company.legal_name).replace(/[^a-zA-Z0-9]+/g, "-");

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="notas-${nomeEmpresa}-${competencia}.xlsx"`,
    },
  });
}
