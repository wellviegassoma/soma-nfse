import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermissao } from "@/lib/auth";
import { gerarModeloLote } from "@/lib/lote-notas";

export async function GET(_request: Request, props: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await props.params;
  await requirePermissao("notas.emitir", companyId);

  const supabase = await createClient();
  const [{ data: company }, { data: services }] = await Promise.all([
    supabase.from("companies").select("legal_name, trade_name, codigo_cliente").eq("id", companyId).maybeSingle(),
    supabase.from("services").select("name").eq("company_id", companyId).eq("active", true).order("name"),
  ]);
  if (!company) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });

  const buffer = await gerarModeloLote(services ?? []);
  const nome = `lote-notas-${company.codigo_cliente ?? ""}-${(company.trade_name || company.legal_name).replace(/[^a-zA-Z0-9]+/g, "-")}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nome}"`,
    },
  });
}
