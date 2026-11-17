import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";
import { mesAnteriorBrasilia } from "@/lib/competencia";
import { carregarCentralReinf } from "@/lib/reinf";
import { gerarPlanilhaReinf } from "@/lib/reinf-export";

export async function GET(req: NextRequest) {
  await requireSomaStaff();
  const p = req.nextUrl.searchParams.get("competencia");
  const competencia = p && /^\d{4}-\d{2}$/.test(p) ? p : mesAnteriorBrasilia();
  const { empresas } = await carregarCentralReinf(await createClient(), competencia);
  const buffer = await gerarPlanilhaReinf(competencia, empresas);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="reinf-${competencia}.xlsx"`,
    },
  });
}
